
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Puzzle {
  title: string;
  surface: string; // The "Surface" (riddle)
  bottom: string;  // The "Bottom" (solution)
  difficulty: Difficulty;
}

export interface Interaction {
  type: 'question' | 'guess' | 'hint';
  content: string;
  response: string;
  status?: 'Yes' | 'No' | 'Irrelevant' | 'Correct' | 'Incorrect' | 'Clue';
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  puzzle: Puzzle;
  interactionsCount: number;
  hintsUsed: number;
  status: 'Solved' | 'Surrendered';
}

export enum GameState {
  MENU = 'MENU',
  RULES = 'RULES',
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED',
  HISTORY = 'HISTORY'
}
