
import { GoogleGenAI, Type } from "@google/genai";
import { Puzzle, Interaction, Difficulty } from "./types";

type QuestionStatus = 'Yes' | 'No' | 'Irrelevant';

// Safe JSON parsing with error recovery
const safeJsonParse = (text: string): any => {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('Initial JSON parse failed:', error);
    console.error('Raw response text:', text);

    // Try to clean up common JSON issues
    let cleanedText = text.trim();

    // Remove any leading/trailing non-JSON content
    const jsonStart = cleanedText.indexOf('{');
    const jsonEnd = cleanedText.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
    }

    // Fix common issues
    cleanedText = cleanedText
      .replace(/,\s*}/g, '}') // Remove trailing commas
      .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
      .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":') // Quote unquoted keys
      .replace(/:\s*([^",\[\]{}\n]+)([,}])/g, ': "$1"$2'); // Quote unquoted string values

    try {
      return JSON.parse(cleanedText);
    } catch (secondError) {
      console.error('Cleaned JSON parse also failed:', secondError);
      console.error('Cleaned text:', cleanedText);
      throw new Error(`JSON parsing failed after cleanup: ${secondError instanceof Error ? secondError.message : String(secondError)}`);
    }
  }
};

// Model selection with fallback logic
const getModelForDifficulty = (difficulty: Difficulty, attemptCount: number = 0): string => {
  const models = {
    Easy: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'], // Start with fast/simple model
    Medium: ['gemini-1.5-pro', 'gemini-pro', 'gemini-1.5-flash'], // Start with more capable model
    Hard: ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'] // Start with most capable model
  };

  const difficultyModels = models[difficulty] || models.Easy;
  const modelIndex = Math.max(0, Math.min(attemptCount, difficultyModels.length - 1));

  return difficultyModels[modelIndex]!;
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
export const generateNewPuzzle = async (difficulty: Difficulty, playedTitles: string[] = [], attemptCount: number = 0): Promise<Puzzle> => {
  const maxRetries = 3;

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const model = getModelForDifficulty(difficulty, attemptCount);

    const response = await ai.models.generateContent({
      model,
      contents: `Generate a ${difficulty} difficulty medieval lateral thinking puzzle.
      ${difficulty === 'Easy' ? 'Use very simple, classic logic like "it was a dog" or "he jumped from a low height".' : ''}
      Avoid puzzles similar to these previously played ones: ${playedTitles.join(', ')}.
      This includes similar scenarios, riddles, or solutions that users have already encountered.`,
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
      data = safeJsonParse(rawText);
    } catch (parseError) {
      throw new Error(`Invalid JSON response from Gemini API: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // Validate required fields
    if (!data.title || !data.surface || !data.bottom) {
      throw new Error('Incomplete puzzle data received from Gemini API');
    }

    return { ...data, difficulty };
  } catch (error) {
    console.error(`Failed to generate puzzle (attempt ${attemptCount + 1}):`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // If this is a model-related error and we haven't exhausted retries, try with a different model
    if ((errorMessage.includes('model') || errorMessage.includes('MODEL')) && attemptCount < maxRetries - 1) {
      console.log(`Retrying with alternative model (attempt ${attemptCount + 2})`);
      return generateNewPuzzle(difficulty, playedTitles, attemptCount + 1);
    }

    // Handle other specific errors
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

export const generateHint = async (puzzle: Puzzle, history: Interaction[], hintIndex: number, attemptCount: number = 0): Promise<string> => {
  const maxRetries = 3;

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const model = getModelForDifficulty(puzzle.difficulty, attemptCount);

    const previousHints = history
      .filter(h => h.type === 'hint')
      .map(h => h.response)
      .join(' | ');

    const response = await ai.models.generateContent({
      model,
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
      data = safeJsonParse(rawText);
    } catch (parseError) {
      throw new Error(`Invalid JSON response from Gemini API: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    if (!data.hint || typeof data.hint !== 'string') {
      throw new Error('Invalid hint data received from Gemini API');
    }

    return data.hint;
  } catch (error) {
    console.error(`Failed to generate hint (attempt ${attemptCount + 1}):`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // If this is a model-related error and we haven't exhausted retries, try with a different model
    if ((errorMessage.includes('model') || errorMessage.includes('MODEL')) && attemptCount < maxRetries - 1) {
      console.log(`Retrying hint generation with alternative model (attempt ${attemptCount + 2})`);
      return generateHint(puzzle, history, hintIndex, attemptCount + 1);
    }

    // Handle other specific errors
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
  isGuess: boolean,
  attemptCount: number = 0
): Promise<Interaction> => {
  const maxRetries = 3;

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const model = getModelForDifficulty(puzzle.difficulty, attemptCount);

    if (isGuess) {
      const response = await ai.models.generateContent({
        model,
        contents: `[TRUTH]: ${puzzle.bottom}
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
8. If incorrect, feedback must be exactly "The truth remains shrouded in mystery."`,
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
        result = safeJsonParse(rawText);
      } catch (parseError) {
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
        model,
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
        result = safeJsonParse(rawText);
      } catch (parseError) {
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
    console.error(`Failed to evaluate interaction (attempt ${attemptCount + 1}):`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // If this is a model-related error and we haven't exhausted retries, try with a different model
    if ((errorMessage.includes('model') || errorMessage.includes('MODEL')) && attemptCount < maxRetries - 1) {
      console.log(`Retrying interaction evaluation with alternative model (attempt ${attemptCount + 2})`);
      return evaluateInteraction(puzzle, _history, userInput, isGuess, attemptCount + 1);
    }

    // Handle other specific errors
    if (errorMessage.includes('API_KEY')) {
      throw new Error('Invalid or missing Gemini API key. Please check your .env.local file.');
    }
    if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
      throw new Error('Gemini API quota exceeded. Please try again later.');
    }
    throw new Error(`Failed to process your input: ${errorMessage}`);
  }
};
