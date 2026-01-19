
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Puzzle, Interaction, Difficulty, HistoryEntry } from './types';
import { generateNewPuzzle, evaluateInteraction, generateHint } from './geminiService';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [history, setHistory] = useState<Interaction[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [hintsRemaining, setHintsRemaining] = useState(0);
  const [hintIndex, setHintIndex] = useState(0);
  const [historyLog, setHistoryLog] = useState<HistoryEntry[]>([]);
  
  const historyEndRef = useRef<HTMLDivElement>(null);
  const progressInterval = useRef<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('kingdom_secrets_history');
    if (saved) {
      try {
        setHistoryLog(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  useEffect(() => {
    if (isLoading) {
      setLoadingProgress(0);
      progressInterval.current = window.setInterval(() => {
        setLoadingProgress(prev => {
          const next = prev < 85 ? prev + Math.random() * 8 : prev < 96 ? prev + 0.2 : prev;
          if (Math.floor(next) > Math.floor(prev)) playSfx('tick');
          return next;
        });
      }, 150);
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current);
      setLoadingProgress(100);
    }
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [isLoading]);

  const saveToHistory = (status: 'Solved' | 'Surrendered') => {
    if (!currentPuzzle) return;
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      puzzle: currentPuzzle,
      interactionsCount: history.filter(i => i.type === 'question' || i.type === 'guess').length,
      hintsUsed: history.filter(i => i.type === 'hint').length,
      status
    };
    const newLog = [entry, ...historyLog].slice(0, 50); 
    setHistoryLog(newLog);
    localStorage.setItem('kingdom_secrets_history', JSON.stringify(newLog));
  };

  const playSfx = (type: 'yes' | 'no' | 'correct' | 'click' | 'wood' | 'tick' | 'hint' | 'solve_fail') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      const now = ctx.currentTime;

      switch(type) {
        case 'yes': {
          const yOsc = ctx.createOscillator();
          yOsc.connect(gain);
          yOsc.type = 'square';
          yOsc.frequency.setValueAtTime(523.25, now);
          yOsc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);
          gain.gain.setValueAtTime(0.45, now); // Increased volume
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          yOsc.start();
          yOsc.stop(now + 0.2);
          break;
        }
        case 'no': {
          const nOsc = ctx.createOscillator();
          nOsc.connect(gain);
          nOsc.type = 'sawtooth';
          nOsc.frequency.setValueAtTime(220, now);
          nOsc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
          gain.gain.setValueAtTime(0.4, now); // Increased volume
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          nOsc.start();
          nOsc.stop(now + 0.2);
          break;
        }
        case 'correct': {
          [523, 659, 783, 1046].forEach((f, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.frequency.setValueAtTime(f, now + i * 0.1);
            g.gain.setValueAtTime(0.35, now + i * 0.1); // Increased volume
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
            o.start(now + i * 0.1);
            o.stop(now + i * 0.1 + 0.3);
          });
          break;
        }
        case 'solve_fail': {
          const sfOsc = ctx.createOscillator();
          sfOsc.connect(gain);
          sfOsc.type = 'sine';
          sfOsc.frequency.setValueAtTime(150, now);
          sfOsc.frequency.setValueAtTime(100, now + 0.1);
          gain.gain.setValueAtTime(0.6, now); // Increased volume
          gain.gain.linearRampToValueAtTime(0, now + 0.3);
          sfOsc.start();
          sfOsc.stop(now + 0.3);
          break;
        }
        case 'click': {
          const clOsc = ctx.createOscillator();
          clOsc.connect(gain);
          clOsc.type = 'sine';
          clOsc.frequency.setValueAtTime(120, now);
          clOsc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
          gain.gain.setValueAtTime(0.6, now); // Increased volume
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          clOsc.start();
          clOsc.stop(now + 0.08);
          break;
        }
        case 'wood': {
          // The preferred wood knock - reinforced for higher volume
          const bandPass = ctx.createBiquadFilter();
          bandPass.type = 'bandpass';
          bandPass.frequency.setValueAtTime(300, now);
          bandPass.Q.setValueAtTime(5, now);
          bandPass.connect(gain);
          const wOsc = ctx.createOscillator();
          wOsc.type = 'sine';
          wOsc.frequency.setValueAtTime(220, now);
          wOsc.connect(bandPass);
          gain.gain.setValueAtTime(0.8, now); // Maximum preferred volume
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          wOsc.start();
          wOsc.stop(now + 0.3);
          break;
        }
        case 'tick': {
          const tOsc = ctx.createOscillator();
          tOsc.connect(gain);
          tOsc.type = 'triangle';
          tOsc.frequency.setValueAtTime(200, now);
          gain.gain.setValueAtTime(0.15, now); // Increased volume
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          tOsc.start();
          tOsc.stop(now + 0.05);
          break;
        }
        case 'hint': {
          const hOsc = ctx.createOscillator();
          hOsc.connect(gain);
          hOsc.type = 'sine';
          hOsc.frequency.setValueAtTime(880, now);
          hOsc.frequency.exponentialRampToValueAtTime(1320, now + 0.2);
          gain.gain.setValueAtTime(0.4, now); // Increased volume
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          hOsc.start();
          hOsc.stop(now + 0.3);
          break;
        }
      }
    } catch (e) {}
  };

  const scrollToBottom = () => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      setTimeout(scrollToBottom, 100);
    }
  }, [history, gameState]);

  const startGame = async (difficulty: Difficulty) => {
    playSfx('click');
    setIsLoading(true);
    setGameState(GameState.LOADING);
    setHistory([]);
    setHintIndex(0);
    setHintsRemaining({ 'Easy': 3, 'Medium': 5, 'Hard': 7 }[difficulty]);
    try {
      const playedTitles = historyLog.map(entry => entry.puzzle.title);
      const puzzle = await generateNewPuzzle(difficulty, playedTitles);
      setCurrentPuzzle(puzzle);
      setGameState(GameState.PLAYING);
      playSfx('wood');
    } catch (error) {
      setGameState(GameState.MENU);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (isGuess: boolean) => {
    playSfx('click');
    if (!input.trim() || !currentPuzzle || isLoading) return;
    const currentInput = input;
    setInput('');
    setIsLoading(true);
    try {
      const result = await evaluateInteraction(currentPuzzle, history, currentInput, isGuess);
      setHistory(prev => [...prev, result]);
      
      if (isGuess) {
        if (result.status === 'Correct') {
          playSfx('correct');
          saveToHistory('Solved');
          setTimeout(() => {
            setGameState(GameState.FINISHED);
            playSfx('wood');
          }, 1200);
        } else {
          playSfx('solve_fail');
        }
      } else {
        if (result.status === 'Yes') playSfx('yes');
        else if (result.status === 'No') playSfx('no');
        else playSfx('tick');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleHint = async () => {
    if (!currentPuzzle || isLoading || hintsRemaining <= 0) return;
    playSfx('hint');
    setIsLoading(true);
    try {
      const newHintIndex = hintIndex + 1;
      const hintText = await generateHint(currentPuzzle, history, newHintIndex);
      setHistory(prev => [...prev, {
        type: 'hint',
        content: `Seek Clue (#${newHintIndex})`,
        response: hintText,
        status: 'Clue'
      }]);
      setHintsRemaining(prev => prev - 1);
      setHintIndex(newHintIndex);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSurrender = () => {
    playSfx('click');
    saveToHistory('Surrendered');
    setGameState(GameState.FINISHED);
    playSfx('wood');
  };

  const navigateTo = (state: GameState) => {
    playSfx('click');
    if (state === GameState.HISTORY || state === GameState.RULES) {
      playSfx('wood');
    }
    setGameState(state);
  };

  const getDifficultyColor = (diff: Difficulty) => {
    switch(diff) {
      case 'Easy': return 'text-green-600 bg-green-100 border-green-300';
      case 'Medium': return 'text-yellow-700 bg-yellow-100 border-yellow-300';
      case 'Hard': return 'text-red-700 bg-red-100 border-red-300';
      default: return 'text-gray-600 bg-gray-100 border-gray-300';
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col overflow-hidden text-2xl pixel-reading">
      {gameState === GameState.MENU && (
        <div key="menu" className="flex flex-col items-center justify-center flex-1 p-4 relative z-10 animate-page-entry overflow-y-auto">
          <h1 className="text-4xl md:text-6xl text-center mb-16 text-[#c5a059] tracking-tighter uppercase font-black font-pixel-title" style={{ textShadow: '8px 8px 0px #7b0000, 0 0 15px rgba(0,0,0,0.6)' }}>
            KINGDOM SECRETS<br/><span className="text-xl text-gray-300 mt-4 block tracking-widest font-bold">RIDDLE INVESTIGATION</span>
          </h1>
          <div className="menu-panel p-10 max-w-lg w-full text-center">
            <div className="space-y-6">
              <button onClick={() => startGame('Easy')} className="w-full medieval-button py-5 text-lg font-bold uppercase tracking-widest">Peasant (Easy)</button>
              <button onClick={() => startGame('Medium')} className="w-full medieval-button py-5 text-lg font-bold uppercase tracking-widest">Knight (Medium)</button>
              <button onClick={() => startGame('Hard')} className="w-full medieval-button py-5 text-lg font-bold uppercase tracking-widest">Lord (Hard)</button>
              
              <div className="pt-4 mt-2 border-t border-[#4a4138] flex gap-4">
                <button 
                  onClick={() => navigateTo(GameState.RULES)} 
                  className="flex-1 medieval-button py-1.5 text-[10px] tracking-widest"
                >
                  Laws
                </button>
                <button 
                  onClick={() => navigateTo(GameState.HISTORY)} 
                  className="flex-1 medieval-button py-1.5 text-[10px] tracking-widest"
                >
                  Archives
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameState === GameState.HISTORY && (
        <div key="history" className="flex flex-col items-center justify-center flex-1 p-4 md:p-6 z-10 relative animate-page-entry">
          <div className="parchment p-8 md:p-10 max-w-4xl w-full border-8 border-[#3d3d3d] shadow-2xl flex flex-col h-[85vh]">
            <h2 className="text-xl md:text-2xl mb-6 border-b-4 border-[#bdae82] pb-4 font-bold uppercase text-center text-[#7b0000] font-pixel-title">Chronicle of Past Deeds</h2>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {historyLog.length === 0 ? (
                <div className="text-center py-24 text-[#433422]/20 uppercase font-bold text-3xl pixel-reading leading-relaxed italic">
                  The archives are empty...<br/>only dust remains.
                </div>
              ) : (
                historyLog.map((entry) => (
                  <div key={entry.id} className="border-2 border-[#bdae82] p-4 bg-white/70 hover:bg-white/90">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-2 items-center">
                          <span className={`px-2 py-1 text-[8px] font-bold uppercase w-fit font-pixel-title ${entry.status === 'Solved' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                            {entry.status}
                          </span>
                          <span className={`px-2 py-0.5 text-[8px] font-bold uppercase border ${getDifficultyColor(entry.puzzle.difficulty)} font-pixel-title`}>
                            {entry.puzzle.difficulty}
                          </span>
                        </div>
                        <span className="text-[12px] text-gray-500 font-bold uppercase mt-1">
                          {entry.interactionsCount} Inquiries | {entry.hintsUsed} Hints
                        </span>
                      </div>
                      <span className="text-[12px] text-gray-600 font-bold">{new Date(entry.timestamp).toLocaleDateString()}</span>
                    </div>
                    <h4 className="text-2xl font-bold text-[#433422] mb-1">{entry.puzzle.title}</h4>
                    <p className="text-lg italic text-gray-700 mb-2 line-clamp-1">"{entry.puzzle.surface}"</p>
                    <details className="mt-2 text-[14px] cursor-pointer" onToggle={() => playSfx('click')}>
                      <summary className="text-[#7b0000] font-bold uppercase hover:underline">View Truth</summary>
                      <p className="mt-2 p-3 bg-[#fdf8e8] border-l-4 border-[#7b0000] text-lg pixel-reading text-[#433422] leading-relaxed">
                        {entry.puzzle.bottom}
                      </p>
                    </details>
                  </div>
                ))
              )}
            </div>
            <div className="mt-8">
              <button onClick={() => navigateTo(GameState.MENU)} className="medieval-button w-full py-4 text-sm font-bold uppercase">Return</button>
            </div>
          </div>
        </div>
      )}

      {gameState === GameState.RULES && (
        <div key="rules" className="flex flex-col items-center justify-center flex-1 p-4 md:p-6 z-10 relative animate-page-entry overflow-y-auto">
          <div className="parchment p-10 md:p-12 max-w-3xl w-full border-8 border-[#3d3d3d] shadow-2xl">
            <h2 className="text-3xl md:text-4xl mb-10 border-b-4 border-[#bdae82] pb-4 font-bold uppercase text-center text-[#7b0000] font-pixel-title">LAWS OF INQUIRY</h2>
            <div className="text-2xl space-y-6 pixel-reading leading-relaxed text-[#433422] font-bold">
              <p>1. <strong className="text-[#7b0000]">Fragments of Truth</strong>: The Chronicler speaks a bizarre scenario. The truth is hidden in shadows.</p>
              <p>2. <strong className="text-[#7b0000]">Inquiry Taboos</strong>: Your questions must be answered with "Yes", "No", or "Irrelevant".</p>
              <p>3. <strong className="text-[#7b0000]">The Verdict</strong>: Submit your solve guess for judgment.</p>
              <p>4. <strong className="text-[#7b0000]">The Archives</strong>: Every completed case is stored in the History Log.</p>
            </div>
            <div className="mt-12 text-center">
              <button onClick={() => navigateTo(GameState.MENU)} className="medieval-button px-8 py-2 text-[10px] font-bold uppercase">Return</button>
            </div>
          </div>
        </div>
      )}

      {gameState === GameState.LOADING && (
        <div key="loading" className="flex flex-col items-center justify-center flex-1 z-10 animate-page-entry px-6">
          <div className="flex flex-col items-center w-full max-w-2xl">
            <div className="text-2xl md:text-4xl mb-10 text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] font-bold tracking-widest uppercase animate-pulse text-center w-full font-pixel-title">
              Chronicler is unrolling archives...
            </div>
            <div className="w-full max-w-md h-6 bg-[#111] border-4 border-gray-700 shadow-[4px_4px_0_#000] relative overflow-hidden">
              <div 
                className="h-full bg-[#7b0000] transition-all duration-300 ease-out" 
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {gameState === GameState.PLAYING && (
        <div key="playing" className="flex flex-col h-[100dvh] lg:h-screen relative z-10 p-2 md:p-6 max-w-7xl mx-auto w-full animate-page-entry overflow-hidden">
          {/* Header */}
          <div className="flex justify-between items-center mb-2 md:mb-4 stone-border p-2 md:p-3 shrink-0">
            <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
              <div className="w-8 h-8 md:w-12 md:h-12 flex items-center justify-center text-xl md:text-3xl stone-border font-bold text-[#c5a059] font-pixel-title shrink-0">?</div>
              <div className="flex flex-col">
                <div className="text-[8px] md:text-[10px] text-[#c5a059] uppercase font-bold tracking-widest truncate font-pixel-title">Case: {currentPuzzle?.title}</div>
                <div className="text-[6px] md:text-[8px] text-gray-400 uppercase font-bold tracking-tighter font-pixel-title mt-0.5">Complexity: {currentPuzzle?.difficulty}</div>
              </div>
            </div>
            <div className="flex gap-1 md:gap-4">
              {hintsRemaining > 0 && (
                <button onClick={handleHint} disabled={isLoading} className="medieval-button px-2 md:px-4 py-1 md:py-2 text-[6px] md:text-[8px]">Hint ({hintsRemaining})</button>
              )}
              <button onClick={handleSurrender} disabled={isLoading} className="medieval-button danger-button px-2 md:px-4 py-1 md:py-2 text-[6px] md:text-[8px]">Surrender</button>
              <button onClick={() => navigateTo(GameState.MENU)} className="medieval-button px-2 md:px-4 py-1 md:py-2 text-[6px] md:text-[8px] bg-[#111]">Exit</button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-3 md:gap-6 flex-1 min-h-0 overflow-hidden">
            {/* Mobile Surface Section */}
            <div className="block lg:hidden shrink-0">
              <div className="parchment p-3 stone-border max-h-[15vh] overflow-y-auto">
                <div className="text-[10px] text-[#8b4513] mb-1 border-b border-[#bdae82] pb-0.5 font-black tracking-widest uppercase font-pixel-title">The Surface</div>
                <p className="text-lg leading-snug text-[#433422] pixel-reading font-bold italic">{currentPuzzle?.surface}</p>
              </div>
            </div>

            {/* Inquiry Log */}
            <div className="flex-1 flex flex-col min-h-0 stone-border order-2 lg:order-1">
               <div className="bg-[#111] p-1 md:p-2 border-b-2 border-gray-800 shrink-0">
                  <span className="text-[#c5a059] text-[10px] md:text-[12px] uppercase tracking-widest font-bold font-pixel-title">Inquiry Log</span>
               </div>
               <div className="flex-1 overflow-y-auto p-3 md:p-5 space-y-4 md:space-y-6">
                {history.length === 0 && <div className="text-gray-500 text-center py-12 uppercase text-xl md:text-3xl pixel-reading tracking-widest animate-pulse italic">Speak into the abyss...</div>}
                {history.map((item, idx) => (
                  <div key={idx} className={`p-4 md:p-6 border-l-[8px] md:border-l-[12px] ${item.type === 'guess' ? 'border-[#7b0000] bg-red-950/40' : item.type === 'hint' ? 'border-[#c5a059] bg-yellow-950/20' : 'border-[#444] bg-gray-900/60'} animate-page-entry`}>
                    <div className="mb-1 md:mb-2">
                      <span className="text-lg md:text-2xl text-gray-100 pixel-reading leading-relaxed font-bold">{item.content}</span>
                    </div>
                    {item.status && (
                      <div className="pl-3 md:pl-4 border-l-2 md:border-l-4 border-gray-800/50">
                        <span className={`text-lg md:text-2xl font-black ${item.status === 'Yes' ? 'text-green-400' : item.status === 'No' ? 'text-red-400' : 'text-gray-400'} pixel-reading uppercase`}>
                           {item.status === 'Yes' ? '▶ YES' : item.status === 'No' ? '▶ NO' : item.status === 'Irrelevant' ? '▶ N/A' : `▶ ${item.status?.toUpperCase()}`}
                        </span>
                      </div>
                    )}
                    {item.response && (
                      <div className="mt-1 md:mt-2 text-base md:text-xl text-gray-300 pixel-reading italic pl-3 md:pl-4 border-l border-[#555]">
                        {item.response}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={historyEndRef} />
               </div>
            </div>

            {/* Sidebar */}
            <div className="lg:w-[450px] flex flex-col gap-3 md:gap-4 shrink-0 order-3 lg:order-2">
              <div className="hidden lg:flex parchment p-8 stone-border relative flex-shrink-0 overflow-y-auto max-h-[40%] flex-col">
                <div className="text-[12px] text-[#8b4513] mb-2 border-b-2 border-[#bdae82] pb-1 font-black tracking-widest uppercase font-pixel-title">The Surface</div>
                <p className="text-2xl leading-relaxed text-[#433422] pixel-reading font-bold italic">{currentPuzzle?.surface}</p>
              </div>

              <div className="stone-border p-3 md:p-6 flex flex-col min-h-0 bg-black/40 h-[28vh] lg:h-auto lg:flex-1">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                  placeholder="Inquire..."
                  className="w-full h-full bg-[#0a0a0a] text-gray-100 p-3 md:p-4 mb-3 md:mb-4 text-lg md:text-2xl border-4 border-gray-800 focus:border-[#c5a059] outline-none resize-none pixel-reading font-bold shadow-inner"
                />
                <div className="grid grid-cols-2 gap-2 md:gap-4 shrink-0">
                  <button onClick={() => handleAction(false)} disabled={isLoading || !input.trim()} className="medieval-button py-3 md:py-6 text-[10px] md:text-[12px] font-black tracking-widest">ASK</button>
                  <button onClick={() => handleAction(true)} disabled={isLoading || !input.trim()} className="medieval-button py-3 md:py-6 text-[10px] md:text-[12px] font-black tracking-widest bg-[#222]">SOLVE</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameState === GameState.FINISHED && (
        <div key="finished" className="flex flex-col items-center justify-center flex-1 p-4 z-10 relative animate-page-entry overflow-y-auto">
          <div className="stone-border p-6 md:p-12 text-center max-w-4xl w-full bg-black/60">
            <h3 className="text-[#c5a059] text-2xl md:text-4xl mb-6 md:mb-10 font-black uppercase tracking-widest font-pixel-title">CASE REVEALED</h3>
            <div className="parchment p-6 md:p-12 border-4 border-[#bdae82] mb-8 md:mb-12 text-left shadow-2xl overflow-y-auto max-h-[50vh] lg:max-h-[40vh]">
              <div className="text-[#433422] text-xl md:text-2xl leading-relaxed pixel-reading whitespace-pre-wrap font-bold">{currentPuzzle?.bottom}</div>
            </div>
            <div className="flex flex-col md:flex-row gap-4 md:gap-8">
              <button onClick={() => navigateTo(GameState.MENU)} className="medieval-button flex-1 py-4 md:py-8 text-xl md:text-2xl font-black">RETURN</button>
              <button onClick={() => startGame(currentPuzzle?.difficulty || 'Medium')} className="medieval-button bg-[#7b0000] text-white flex-1 py-4 md:py-8 text-xl md:text-2xl font-black">NEW CASE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
