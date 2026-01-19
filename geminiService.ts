/// <reference types="vite/client" />

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Puzzle, Interaction, Difficulty } from "./types";

type QuestionStatus = 'Yes' | 'No' | 'Irrelevant';

// Model selection with fallback logic
const getModelForDifficulty = (difficulty: Difficulty, attemptCount: number = 0): string => {
  const models = {
    // We use -latest or 2.0 to ensure v1beta compatibility
    Easy: ['gemini-1.5-flash-latest', 'gemini-2.0-flash'],
    Medium: ['gemini-2.0-flash', 'gemini-1.5-pro-latest'],
    Hard: ['gemini-1.5-pro-latest', 'gemini-2.0-flash']
  };

  const difficultyModels = models[difficulty] || models.Easy;
  const modelIndex = Math.max(0, Math.min(attemptCount, difficultyModels.length - 1));

  return difficultyModels[modelIndex]!;
};

// Validate API key at module level
const GEMINI_API_KEY = import.meta.env['VITE_GEMINI_API_KEY'];
console.log('🔑 API Key loaded:', GEMINI_API_KEY ? 'Present' : 'Missing');
if (!GEMINI_API_KEY) {
  throw new Error('VITE_GEMINI_API_KEY environment variable is required but not set. Please create a .env.local file with your Gemini API key.');
}

const CLASSIC_LOGIC_SEEDS = `
1. Height/Reach (Elevator button -> high shelf/pulley).
2. Animals (Dog missing -> FBI doesn't care; Sam the cat killing birds).
3. Inanimate/Status (Gingerbread men in oven; Snowman melting; Stone statue sentry).
4. Physical laws (Jumping from 1st floor window of a high tower; survives).
5. Misunderstanding Profession (Travel agent booking for others; Actress marrying 10 men; Talk show host describing a murder).
6. Simple conditions (Stars/Match/Oil lamp - light match first; Rain and umbrellas).
7. Games (Monopoly car -> bankruptcy; Paintball/Training).
8. Biological (Hiccups/Scare; Baby/Swaddling; Triplets/Twins).
9. Context (Astronaut weightlessness; Library book return; Hospital room numbers).
10. Starvation (Tigers/Beasts dead after 6 months).
`;

const SYSTEM_PROMPT = `You are the Grand Master of Riddles. You specialize in "Turtle Soup" (Lateral Thinking) puzzles.

[Goal]: Generate a scenario (Surface) and a logical truth (Bottom).

[Core Logic Library]:
Incorporate and adapt the following classic themes into a MEDIEVAL setting:
${CLASSIC_LOGIC_SEEDS}

[Difficulty Calibration]:
- EASY: Logic MUST be single-step and universal (e.g., "It was a dog," "He is a child," "He is a statue," "It was raining"). The twist should be a common trope.
- MEDIUM: Requires connecting two distinct facts (e.g., professional duty vs. accidental result).
- HARD: Multi-layered logic or specific situational twists.

[Style]: Medieval flavor. Elevators are "mechanical tower lifts," cars are "carriages," video games are "magical illusions or training," etc.

[Strict Rule]: Use your vast knowledge of riddles to provide unique and logical scenarios. NEVER repeat the same core logic twice in a row.

[Language]: All output must be in English.`;

export const generateNewPuzzle = async (difficulty: Difficulty, playedTitles: string[] = [], attemptCount: number = 0): Promise<Puzzle> => {
  const modelName = getModelForDifficulty(difficulty, attemptCount);

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    // Force v1beta to get responseSchema support
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
    }, { apiVersion: 'v1beta' });

    console.log(`📡 Calling ${modelName} on v1beta...`);

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: `Generate a ${difficulty} medieval puzzle. Avoid: ${playedTitles.join(', ')}` }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING },
            surface: { type: SchemaType.STRING },
            bottom: { type: SchemaType.STRING }
          },
          required: ["title", "surface", "bottom"]
        }
      }
    });

    return JSON.parse(result.response.text());
  } catch (error: any) {
    // If we get a 404, it means the model name was wrong for this endpoint
    if (error.message?.includes('404') && attemptCount < 2) {
      console.warn(`⚠️ Model ${modelName} not found. Retrying with next model...`);
      return generateNewPuzzle(difficulty, playedTitles, attemptCount + 1);
    }
    throw error;
  }
};

export const generateHint = async (puzzle: Puzzle, history: Interaction[], hintIndex: number, attemptCount: number = 0): Promise<string> => {
  try {
    const modelName = getModelForDifficulty(puzzle.difficulty, attemptCount);
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: modelName,
    }, { apiVersion: 'v1beta' });

    const previousHints = history
      .filter(h => h.type === 'hint')
      .map(h => h.response)
      .join(' | ');

    console.log(`📡 Requesting hint from ${modelName} via v1beta...`);

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{
          text: `[TRUTH]: ${puzzle.bottom}
[PREVIOUS HINTS]: ${previousHints || "None"}
[REQUEST]: Cryptic hint #${hintIndex}.
[RULE]: Guide the player's thinking without giving it away. Max 15 words.`
        }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            hint: { type: SchemaType.STRING }
          },
          required: ["hint"]
        }
      }
    });

    const response = result.response;
    const data = JSON.parse(response.text());

    if (!data.hint || typeof data.hint !== 'string') {
      throw new Error('Invalid hint data received from Gemini API');
    }

    return data.hint;

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to generate hint (attempt ${attemptCount + 1}):`, errorMessage);

    if (attemptCount < 2) {
      return generateHint(puzzle, history, hintIndex, attemptCount + 1);
    }
    throw new Error(`Failed to generate hint: ${errorMessage}`);
  }
};

export const evaluateInteraction = async (
  puzzle: Puzzle,
  _history: Interaction[],
  userInput: string,
  isGuess: boolean,
  attemptCount: number = 0
): Promise<Interaction> => {
  try {
    const modelName = getModelForDifficulty(puzzle.difficulty, attemptCount);
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: modelName,
    }, { apiVersion: 'v1beta' });

    console.log(`📡 Evaluating interaction with ${modelName} via v1beta...`);

    if (isGuess) {
      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [{
            text: `[TRUTH]: ${puzzle.bottom}
[PLAYER GUESS]: ${userInput}

[EVALUATION RULES]:
1. Be LENIENT but PRECISE. Accept answers that capture the core "twist", "logic", or "truth" of the mystery.
2. Accept synonyms, paraphrases, and simplified versions that preserve the key mechanism.
3. Accept answers that miss minor details but get the fundamental concept and specific element right.
4. Examples of ACCEPTABLE matches:
   - Truth: "He jumped from the first floor" → Guess: "He jumped from a low height" ✓
   - Truth: "It was a dog" → Guess: "It was a dog" ✓ (or very close synonyms)
   - Truth: "He is a stone statue" → Guess: "He is a statue" or "He is made of stone" ✓
   - Truth: "The elevator stopped between floors" → Guess: "The elevator got stuck between floors" ✓
   - Truth: "She was a professional actress" → Guess: "She was acting" or "She was pretending" ✓
5. REJECT answers that are too vague, generic, or miss the specific key element that makes the puzzle's logic work.
6. Examples of INCORRECT answers:
   - Truth: "It was a dog" → Guess: "It was an animal" ✗ (too vague, doesn't identify the specific animal)
   - Truth: "He is a statue" → Guess: "He can't move" ✗ (misses the material/creation aspect)
   - Truth: "She is pregnant" → Guess: "Something happened to her" ✗ (too generic)
7. Only mark CORRECT if the guess shows clear understanding of the puzzle's specific mechanism or twist.
8. If incorrect, feedback must be exactly "The truth remains shrouded in mystery."`
          }]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              isCorrect: { type: SchemaType.BOOLEAN },
              feedback: { type: SchemaType.STRING }
            },
            required: ["isCorrect", "feedback"]
          }
        }
      });

      const response = result.response;
      const data = JSON.parse(response.text());

      if (typeof data.isCorrect !== 'boolean' || !data.feedback) {
        throw new Error('Invalid evaluation data received from Gemini API');
      }

      return {
        type: 'guess',
        content: userInput,
        response: data.feedback,
        status: data.isCorrect ? 'Correct' : 'Incorrect'
      };

    } else {
      // Question evaluation
      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [{
            text: `[TRUTH]: ${puzzle.bottom}
[PLAYER QUESTION]: ${userInput}
Answer with: 'Yes', 'No', or 'Irrelevant'.`
          }]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              status: { type: SchemaType.STRING }
            },
            required: ["status"]
          }
        }
      });

      const response = result.response;
      const data = JSON.parse(response.text());

      const validStatuses: QuestionStatus[] = ['Yes', 'No', 'Irrelevant'];
      if (!data.status || !validStatuses.includes(data.status)) {
        throw new Error('Invalid question evaluation data received from Gemini API');
      }

      return {
        type: 'question',
        content: userInput,
        response: "",
        status: data.status as QuestionStatus
      };
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to evaluate interaction (attempt ${attemptCount + 1}):`, errorMessage);

    if (attemptCount < 2) {
      return evaluateInteraction(puzzle, _history, userInput, isGuess, attemptCount + 1);
    }
    throw new Error(`Failed to process your input: ${errorMessage}`);
  }
};
