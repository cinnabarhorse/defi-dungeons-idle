'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getCharacterConfig,
  getCharacterStats,
  CHARACTERS,
  onSpriteOverridesChange,
} from '../lib/character-registry';
import { cn } from '../lib/utils';
import type { StatAllocation } from '../lib/progression';
import { GotchiPreview } from './GotchiPreview';
// server URL resolved inside GotchiPreview when needed

interface CharacterPreviewProps {
  characterId: string;
  size?: 'sm' | 'md' | 'lg';
  isSelected?: boolean; // Only selected characters show attack animations
  className?: string;
  allocatedStats?: StatAllocation | null;
}

// Global cache for loaded images to prevent flashing
const imageCache = new Map<string, HTMLImageElement>();
const loadingPromises = new Map<string, Promise<HTMLImageElement>>();

// Preload character images with priority for common characters
const preloadCharacterImages = () => {
  // Sort by rarity - load common/uncommon first for better UX
  const sortedCharacters = [...CHARACTERS].sort((a, b) => {
    const tierOrder = {
      tier1: 0,
      tier2: 1,
      tier3: 2,
      tier4: 3,
    };
    return tierOrder[a.info.tier] - tierOrder[b.info.tier];
  });

  sortedCharacters.forEach((character, index) => {
    const config = getCharacterConfig(character.id);
    if (!imageCache.has(character.id) && !loadingPromises.has(character.id)) {
      const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          imageCache.set(character.id, img);
          loadingPromises.delete(character.id);
          // Preloaded
          resolve(img);
        };
        img.onerror = () => {
          loadingPromises.delete(character.id);
          console.warn(
            `❌ Failed to preload character: ${character.info.name}`
          );
          reject(new Error(`Failed to load ${character.id}`));
        };
        // Ensure lowercase path for deployed assets
        img.src = config.imagePath.replace(
          /\/sprites\/character\/(.*)$/i,
          (_m, rest) => `/sprites/character/${String(rest).toLowerCase()}`
        );
      });
      loadingPromises.set(character.id, promise);
    }
  });
};

// Start preloading immediately
if (typeof window !== 'undefined') {
  preloadCharacterImages();
}

export function CharacterPreview({
  characterId,
  size = 'md',
  isSelected = false,
  className = '',
  allocatedStats = null,
}: CharacterPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);

  const sizeMap = {
    sm: { width: 64, height: 64, scale: 0.96 },
    md: { width: 96, height: 96, scale: 1.28 },
    lg: { width: 128, height: 128, scale: 1.6 },
  };

  const { width, height } = sizeMap[size];
  const isGotchi = characterId.startsWith('gotchi:');
  // Do not compute or display stat modifiers here; shown in My Stats section

  useEffect(() => {
    if (isGotchi) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    let currentFrame = 0;
    let lastFrameTime = 0;
    let lastAttackTime = 0;
    let isAttacking = false;
    let attackFrameCount = 0;
    const frameRate = 12; // 12 FPS for idle animation
    const frameInterval = 1000 / frameRate;
    const attackInterval = 5000; // Attack every 5 seconds
    const attackDuration = 1000; // Attack animation lasts 1 second
    const config = getCharacterConfig(characterId);
    // Compute attack profile once to avoid per-frame work
    const statsForAnim = getCharacterStats(characterId);
    // Use base character stats for preview; do not apply progression modifiers
    const attackRowForAnim = statsForAnim.weaponType === 'ranged' ? 10 : 12;
    const maxFramesForAttack = statsForAnim.weaponType === 'ranged' ? 3 : 6;

    // Initialize error state; keep canvas visible if previously loaded
    setError(false);

    // Load character image (from cache or network)
    const loadCharacterImage = async () => {
      try {
        // Check if image is already cached
        const cachedImage = imageCache.get(characterId);
        if (cachedImage) {
          setIsLoaded(true);
          if (animationRef.current) cancelAnimationFrame(animationRef.current);
          startAnimation(cachedImage);
          return;
        }

        // Check if image is currently loading
        const loadingPromise = loadingPromises.get(characterId);
        const image = loadingPromise
          ? await loadingPromise
          : await loadNewImage();

        setIsLoaded(true);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        startAnimation(image);
      } catch (err) {
        console.warn(`Failed to load character ${characterId}:`, err);
        setError(true);
      }
    };

    const loadNewImage = (): Promise<HTMLImageElement> => {
      const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          imageCache.set(characterId, img);
          loadingPromises.delete(characterId);
          resolve(img);
        };
        img.onerror = () => {
          loadingPromises.delete(characterId);
          reject(new Error(`Failed to load ${characterId}`));
        };
        img.src = config.imagePath;
      });

      loadingPromises.set(characterId, promise);
      return promise;
    };

    loadCharacterImage();

    // Re-render when a sprite override changes (e.g., after refresh reapply)
    const unsubscribe = onSpriteOverridesChange(() => {
      // Bust cached image for this id so the updated URL is used
      imageCache.delete(characterId);
      loadingPromises.delete(characterId);
      loadCharacterImage();
    });

    function startAnimation(image: HTMLImageElement) {
      // Animation loop
      const animate = (timestamp: number) => {
        if (timestamp - lastFrameTime >= frameInterval) {
          // Clear canvas
          if (ctx) ctx.clearRect(0, 0, width, height);

          // Only show attack animations for selected characters
          if (isSelected) {
            // Check if it's time to start an attack animation
            if (!isAttacking && timestamp - lastAttackTime >= attackInterval) {
              isAttacking = true;
              attackFrameCount = 0;
              lastAttackTime = timestamp;
            }

            // Check if attack animation should end
            if (isAttacking && timestamp - lastAttackTime >= attackDuration) {
              isAttacking = false;
              currentFrame = 0; // Reset to idle
            }
          }

          // Calculate frame position
          const frameWidth = config.frameWidth;
          const frameHeight = config.frameHeight;
          let sourceX: number;
          let sourceY: number;

          if (isSelected && isAttacking) {
            // Use precomputed attack animation row/frames
            sourceX = (attackFrameCount % maxFramesForAttack) * frameWidth;
            sourceY = attackRowForAnim * frameHeight; // Ranged (row 10) or melee (row 12) attack
            attackFrameCount++;
          } else {
            // Use idle animation (row 0, frames 0-5)
            sourceX = currentFrame * frameWidth;
            sourceY = 0; // Idle row
          }

          // Draw scaled frame - make character bigger within the canvas
          if (ctx) {
            ctx.imageSmoothingEnabled = false; // Keep pixel art crisp

            // Scale up the character to fill more of the canvas
            const characterScale = 1.5; // Make character 50% bigger
            const scaledWidth = width * characterScale;
            const scaledHeight = height * characterScale;

            // Center the larger character in the canvas
            const offsetX = (width - scaledWidth) / 2;
            const offsetY = (height - scaledHeight) / 2;

            ctx.drawImage(
              image,
              sourceX,
              sourceY,
              frameWidth,
              frameHeight, // Source
              offsetX,
              offsetY,
              scaledWidth,
              scaledHeight // Destination (scaled up and centered)
            );
          }

          // Advance frame (6 frames in both idle and attack animations: 0-5)
          if (!isAttacking) {
            currentFrame = (currentFrame + 1) % 6;
          }
          lastFrameTime = timestamp;
        }

        animationRef.current = requestAnimationFrame(animate);
      };

      // Start animation
      animationRef.current = requestAnimationFrame(animate);
    }

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      unsubscribe();
    };
  }, [
    characterId,
    width,
    height,
    isGotchi,
    // Keep allocatedStats referenced to avoid unused prop warnings, but do not apply modifiers
    allocatedStats?.energy,
    allocatedStats?.aggression,
    allocatedStats?.spookiness,
    allocatedStats?.brainSize,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  if (isGotchi) {
    const idPart = characterId.split(':')[1] || '';
    return (
      <GotchiPreview
        url=""
        gotchiId={idPart}
        size={'sm'}
        className={cn('rounded-md overflow-hidden mb-0', className)}
        hasPanelBackground={false}
        demoAllAnimations={isSelected}
      />
    );
  }

  if (error) {
    // Fallback to character initial
    const character = getCharacterConfig(characterId);
    const initial = character.key
      .replace('character_', '')
      .charAt(0)
      .toUpperCase();

    return (
      <div
        className={`${className} bg-gradient-to-br from-purple-500 to-blue-500 rounded-md flex items-center justify-center text-white font-bold`}
        style={{ width, height, fontSize: `${width * 0.4}px` }}
      >
        {initial}
      </div>
    );
  }

  return (
    <div
      className={cn('relative rounded-md overflow-hidden', className)}
      style={{ width, height }}
    >
      <canvas
        ref={canvasRef}
        className={cn(
          'rounded-none bg-transparent transition-opacity duration-200',
          isLoaded ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
        }}
      />
      {!isLoaded && (
        <div className="absolute inset-0 bg-transparent animate-pulse flex items-center justify-center">
          {error && (
            <span className="text-white/60 text-xs font-bold">
              {getCharacterConfig(characterId)
                .key.replace('character_', '')
                .charAt(0)
                .toUpperCase()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
