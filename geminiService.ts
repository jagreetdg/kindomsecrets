
import { GoogleGenAI, Type } from "@google/genai";
import { Puzzle, Interaction, Difficulty } from "./types";

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

// Fix: Initializing GoogleGenAI inside each function call to ensure use of the current process.env.API_KEY.
export const generateNewPuzzle = async (difficulty: Difficulty, playedTitles: string[] = []): Promise<Puzzle> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Generate a ${difficulty} difficulty medieval lateral thinking puzzle. 
    ${difficulty === 'Easy' ? 'Use very simple, classic logic like "it was a dog" or "he jumped from a low height".' : ''}
    Avoid these themes: ${playedTitles.join(', ')}.`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      // Fix: Removed googleSearch tool because it is not recommended when using responseMimeType: "application/json"
      // to ensure the response is strictly valid JSON for parsing.
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

  const data = JSON.parse(response.text.trim());
  return { ...data, difficulty };
};

export const generateHint = async (puzzle: Puzzle, history: Interaction[], hintIndex: number): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const previousHints = history
    .filter(h => h.type === 'hint')
    .map(h => h.response)
    .join(' | ');

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
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

  return JSON.parse(response.text.trim()).hint;
};

export const evaluateInteraction = async (
  puzzle: Puzzle, 
  history: Interaction[], 
  userInput: string, 
  isGuess: boolean
): Promise<Interaction> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  if (isGuess) {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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

    const result = JSON.parse(response.text.trim());
    return {
      type: 'guess',
      content: userInput,
      response: result.feedback,
      status: result.isCorrect ? 'Correct' : 'Incorrect'
    };
  } else {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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

    return {
      type: 'question',
      content: userInput,
      response: "", 
      status: JSON.parse(response.text.trim()).status as any
    };
  }
};
