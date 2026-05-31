import { useState } from 'react';

export function useGameState() {
  const [gameStarted, setGameStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Generate default player name on component mount
  const [placeholderName] = useState(() => {
    const names = ['Explorer', 'Wanderer', 'Adventurer', 'Seeker', 'Voyager'];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const randomNumber = Math.floor(Math.random() * 1000);
    return `${randomName}_${randomNumber}`;
  });

  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState<string | null>(null);

  return {
    gameStarted,
    setGameStarted,
    isStarting,
    setIsStarting,
    placeholderName,
    playerName,
    setPlayerName,
    error,
    setError,
  };
}
