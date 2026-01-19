
import { GoogleGenAI, Type } from "@google/genai";
import { Puzzle, Interaction, Difficulty } from "./types";

type QuestionStatus = 'Yes' | 'No' | 'Irrelevant';

const getModelForDifficulty = (difficulty: Difficulty): string => {
  switch (difficulty) {
    case 'Easy':
      return 'gemini-1.5-flash';
    case 'Medium':
      return 'gemini-3-flash';
    case 'Hard':
      return 'gemini-3-pro';
    default:
      return 'gemini-1.5-flash'; // fallback
  }
};

// Validate API key at module level
const GEMINI_API_KEY = process.env['GEMINI_API_KEY'];
if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is required but not set. Please create a .env.local file with your Gemini API key.');
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
export const generateNewPuzzle = async (difficulty: Difficulty, playedTitles: string[] = []): Promise<Puzzle> => {
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: getModelForDifficulty(difficulty),
      contents: `Generate a ${difficulty} difficulty medieval lateral thinking puzzle.
      ${difficulty === 'Easy' ? 'Use very simple, classic logic like "it was a dog" or "he jumped from a low height".' : ''}
      Avoid these themes: ${playedTitles.join(', ')}.`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            surface: { type: Type.STRING },
            bottom: { type: Type.STRING }
          },
          required: ["title", "surface", "bottom"]
        }
      }
    });

    if (!response.text) {
      throw new Error('Empty response from Gemini API');
    }

    const rawText = response.text.trim();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', rawText);
      throw new Error(`Invalid JSON response from Gemini API: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // Validate required fields
    if (!data.title || !data.surface || !data.bottom) {
      throw new Error('Incomplete puzzle data received from Gemini API');
    }

    return { ...data, difficulty };
  } catch (error) {
    console.error('Failed to generate puzzle:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('API_KEY')) {
      throw new Error('Invalid or missing Gemini API key. Please check your .env.local file.');
    }
    if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
      throw new Error('Gemini API quota exceeded. Please try again later.');
    }
    if (errorMessage.includes('model')) {
      throw new Error('Gemini model not available. Please check model configuration.');
    }
    throw new Error(`Failed to generate puzzle: ${errorMessage}`);
  }
};

export const generateHint = async (puzzle: Puzzle, history: Interaction[], hintIndex: number): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const previousHints = history
      .filter(h => h.type === 'hint')
      .map(h => h.response)
      .join(' | ');

    const response = await ai.models.generateContent({
      model: getModelForDifficulty(puzzle.difficulty),
      contents: `[TRUTH]: ${puzzle.bottom}
[PREVIOUS HINTS]: ${previousHints || "None"}
[REQUEST]: Cryptic hint #${hintIndex}.
[RULE]: Guide the player's thinking without giving it away. Max 15 words.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hint: { type: Type.STRING }
          },
          required: ["hint"]
        }
      }
    });

    if (!response.text) {
      throw new Error('Empty response from Gemini API');
    }

    const rawText = response.text.trim();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', rawText);
      throw new Error(`Invalid JSON response from Gemini API: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    if (!data.hint || typeof data.hint !== 'string') {
      throw new Error('Invalid hint data received from Gemini API');
    }

    return data.hint;
  } catch (error) {
    console.error('Failed to generate hint:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('API_KEY')) {
      throw new Error('Invalid or missing Gemini API key. Please check your .env.local file.');
    }
    if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
      throw new Error('Gemini API quota exceeded. Please try again later.');
    }
    throw new Error(`Failed to generate hint: ${errorMessage}`);
  }
};

export const evaluateInteraction = async (
  puzzle: Puzzle,
  _history: Interaction[],
  userInput: string,
  isGuess: boolean
): Promise<Interaction> => {
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    if (isGuess) {
      const response = await ai.models.generateContent({
        model: getModelForDifficulty(puzzle.difficulty),
        contents: `[TRUTH]: ${puzzle.bottom}
[PLAYER GUESS]: ${userInput}

[EVALUATION RULES]:
1. Be SMART and LENIENT. If the player captures the core "twist" or "truth" of the mystery, it is CORRECT.
2. Synonyms or simplified explanations are fine (e.g., if truth is "he is a stone carving statue" and player says "he is a statue", that is CORRECT).
3. If incorrect, feedback must be exactly "The truth remains shrouded in mystery."`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isCorrect: { type: Type.BOOLEAN },
              feedback: { type: Type.STRING }
            },
            required: ["isCorrect", "feedback"]
          }
        }
      });

      if (!response.text) {
        throw new Error('Empty response from Gemini API');
      }

      const rawText = response.text.trim();
      let result;
      try {
        result = JSON.parse(rawText);
      } catch (parseError) {
        console.error('Failed to parse JSON response:', rawText);
        throw new Error(`Invalid JSON response from Gemini API: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }

      if (typeof result.isCorrect !== 'boolean' || !result.feedback) {
        throw new Error('Invalid evaluation data received from Gemini API');
      }

      return {
        type: 'guess',
        content: userInput,
        response: result.feedback,
        status: result.isCorrect ? 'Correct' : 'Incorrect'
      };
    } else {
      const response = await ai.models.generateContent({
        model: getModelForDifficulty(puzzle.difficulty),
        contents: `[TRUTH]: ${puzzle.bottom}\n[PLAYER QUESTION]: ${userInput}\nAnswer with: 'Yes', 'No', or 'Irrelevant'.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING, enum: ['Yes', 'No', 'Irrelevant'] }
            },
            required: ["status"]
          }
        }
      });

      if (!response.text) {
        throw new Error('Empty response from Gemini API');
      }

      const rawText = response.text.trim();
      let result;
      try {
        result = JSON.parse(rawText);
      } catch (parseError) {
        console.error('Failed to parse JSON response:', rawText);
        throw new Error(`Invalid JSON response from Gemini API: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }

      const validStatuses: QuestionStatus[] = ['Yes', 'No', 'Irrelevant'];
      if (!result.status || !validStatuses.includes(result.status)) {
        throw new Error('Invalid question evaluation data received from Gemini API');
      }

      return {
        type: 'question',
        content: userInput,
        response: "",
        status: result.status as QuestionStatus
      };
    }
  } catch (error) {
    console.error('Failed to evaluate interaction:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('API_KEY')) {
      throw new Error('Invalid or missing Gemini API key. Please check your .env.local file.');
    }
    if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
      throw new Error('Gemini API quota exceeded. Please try again later.');
    }
    throw new Error(`Failed to process your input: ${errorMessage}`);
  }
};
