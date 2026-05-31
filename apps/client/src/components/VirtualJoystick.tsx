'use client';

import { useEffect, useRef, useState } from 'react';

interface VirtualJoystickProps {
  onMove: (direction: { x: number; y: number; isMoving: boolean }) => void;
  size?: number;
  className?: string;
}

export function VirtualJoystick({
  onMove,
  size = 120,
  className = '',
}: VirtualJoystickProps) {
  const joystickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const maxDistance = size / 2 - 15; // Account for knob size

  const handleStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    updatePosition(clientX, clientY);
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    updatePosition(clientX, clientY);
  };

  const handleEnd = () => {
    setIsDragging(false);
    setPosition({ x: 0, y: 0 });
    onMove({ x: 0, y: 0, isMoving: false });
  };

  const updatePosition = (clientX: number, clientY: number) => {
    if (!joystickRef.current) return;

    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let deltaX = clientX - centerX;
    let deltaY = clientY - centerY;

    // Limit to circle
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > maxDistance) {
      deltaX = (deltaX / distance) * maxDistance;
      deltaY = (deltaY / distance) * maxDistance;
    }

    setPosition({ x: deltaX, y: deltaY });

    // Normalize for game input (-1 to 1)
    const normalizedX = deltaX / maxDistance;
    const normalizedY = deltaY / maxDistance;

    onMove({
      x: normalizedX,
      y: normalizedY,
      isMoving: distance > 3, // Smaller dead zone for more responsive movement
    });
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    handleEnd();
  };

  // Mouse events for testing on desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      handleEnd();
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className={`relative select-none ${className}`}>
      <div
        ref={joystickRef}
        className="relative bg-black/40 border-2 border-white/30 rounded-full backdrop-blur-sm touch-none"
        style={{ width: size, height: size, touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {/* Outer ring indicator */}
        <div
          className="absolute inset-2 border border-white/20 rounded-full"
          style={{
            background:
              'radial-gradient(circle, transparent 60%, rgba(255,255,255,0.1) 100%)',
          }}
        />

        {/* Center dot */}
        <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-white/30 rounded-full transform -translate-x-1/2 -translate-y-1/2" />

        {/* Knob */}
        <div
          ref={knobRef}
          className="absolute w-8 h-8 bg-white/80 border-2 border-gray-300 rounded-full shadow-lg transition-transform"
          style={{
            transform: `translate(${position.x + size / 2 - 16}px, ${position.y + size / 2 - 16}px)`,
            boxShadow: isDragging
              ? '0 0 20px rgba(255,255,255,0.5)'
              : '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {/* Direction indicator arrows */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 bg-gray-600 rounded-full opacity-60" />
          </div>
        </div>

        {/* Movement indicator */}
        {isDragging && (
          <div className="absolute inset-0 border-2 border-blue-400/50 rounded-full animate-pulse" />
        )}
      </div>

      {/* Label */}
      <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2">
        <span className="text-xs text-white/70 font-medium">MOVE</span>
      </div>
    </div>
  );
}
