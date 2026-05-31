'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '../../components/ui/Button';
import { itemTypes } from '../../data/wearables';
import {
  RUN_ARCHETYPES,
  RunArchetypeDefinition,
  getRunLevelTraitLabelByType,
} from '../../data/archetypes';

// View model derived from shared archetype definition
interface ArchetypeVM {
  name: string;
  traitProfile: RunArchetypeDefinition['traitProfile'];
  description: string;
  spriteName?: string;
  levelTraitLabel: string;
}

// Map shared data to local view model
const ARCHETYPES: ArchetypeVM[] = RUN_ARCHETYPES.map((a) => ({
  name: a.name,
  traitProfile: a.traitProfile,
  description: a.description || '',
  spriteName: a.spriteName,
  levelTraitLabel: getRunLevelTraitLabelByType(a.levelTrait.type),
}));

// Character Sprite Preview Component
interface CharacterSpriteProps {
  spriteName: string;
  size?: number;
}

function CharacterSprite({ spriteName, size = 128 }: CharacterSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || error) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Animation state
    let currentFrame = 0;
    let lastFrameTime = 0;
    const frameInterval = 1000 / 12; // 12 FPS for idle animation
    const totalFrames = 6; // 6 frames in idle animation (0-5)

    // Load the sprite sheet
    const img = new Image();
    img.onload = () => {
      try {
        // Character sprite sheets are 100x100 per frame, 6 frames per row
        const frameWidth = 100;
        const frameHeight = 100;

        // Start animation loop
        const animate = (timestamp: number) => {
          // Clear canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Update frame if enough time has passed
          if (timestamp - lastFrameTime >= frameInterval) {
            currentFrame = (currentFrame + 1) % totalFrames;
            lastFrameTime = timestamp;
          }

          // Calculate source position (idle_down is row 0)
          const sourceX = currentFrame * frameWidth;
          const sourceY = 0; // Row 0 for idle_down

          // Draw current frame
          ctx.imageSmoothingEnabled = false; // Keep pixel art crisp
          ctx.drawImage(
            img,
            sourceX,
            sourceY, // Source position (current frame)
            frameWidth,
            frameHeight, // Source size
            0,
            0, // Destination position
            size,
            size // Destination size (scaled to fit canvas)
          );

          // Continue animation
          animationRef.current = requestAnimationFrame(animate);
        };

        // Start animation
        animationRef.current = requestAnimationFrame(animate);
      } catch (err) {
        console.warn(`Failed to animate sprite for ${spriteName}:`, err);
        setError(true);
      }
    };

    img.onerror = () => {
      console.warn(`Failed to load sprite sheet: ${spriteName}`);
      setError(true);
    };

    img.src = `/sprites/character/${String(spriteName).toLowerCase()}.png`;

    // Cleanup animation on unmount or dependency change
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [spriteName, size, error]);

  if (error) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 text-xs"
        style={{ width: size, height: size }}
      >
        N/A
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className=""
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

// Function to check if a wearable is compatible with an archetype
function isWearableCompatible(wearable: any, archetype: ArchetypeVM): boolean {
  const modifiers = wearable.traitModifiers;
  if (!modifiers || modifiers.length < 4) return false;

  const [energy, aggression, spookiness, brainSize] = modifiers;

  // For each trait, check if the modifier aligns with the archetype's preference
  // High traits should not have negative modifiers, low traits should not have positive modifiers
  const energyCompatible =
    archetype.traitProfile.energy === 'high' ? energy >= 0 : energy <= 0;
  const aggressionCompatible =
    archetype.traitProfile.aggression === 'high'
      ? aggression >= 0
      : aggression <= 0;
  const spookinessCompatible =
    archetype.traitProfile.spookiness === 'high'
      ? spookiness >= 0
      : spookiness <= 0;
  const brainSizeCompatible =
    archetype.traitProfile.brainSize === 'high'
      ? brainSize >= 0
      : brainSize <= 0;

  // ALL traits must be compatible (not go against the archetype's preferences)
  // AND at least one trait should provide a positive benefit (modifier != 0)
  const allTraitsCompatible =
    energyCompatible &&
    aggressionCompatible &&
    spookinessCompatible &&
    brainSizeCompatible;

  const hasPositiveBenefit =
    Math.abs(energy) > 0 ||
    Math.abs(aggression) > 0 ||
    Math.abs(spookiness) > 0 ||
    Math.abs(brainSize) > 0;

  return allTraitsCompatible && hasPositiveBenefit;
}

export default function BuildsPage() {
  const [selectedArchetype, setSelectedArchetype] =
    useState<ArchetypeVM | null>(null);
  const [compatibleWearables, setCompatibleWearables] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [selectedTrait, setSelectedTrait] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [allCompatibleWearables, setAllCompatibleWearables] = useState<any[]>(
    []
  );

  // Get unique slot positions from wearables
  const getSlotPositions = () => {
    const slots = new Set<string>();
    Object.values(itemTypes).forEach((wearable: any) => {
      if (wearable.slotPositions && wearable.slotPositions.trim()) {
        slots.add(wearable.slotPositions);
      }
    });
    return Array.from(slots).sort();
  };

  // Get unique rarities from wearables and determine rarity order
  const getRarities = () => {
    const rarityOrder = [
      'common',
      'uncommon',
      'rare',
      'legendary',
      'mythical',
      'godlike',
    ];
    const rarities = new Set<string>();

    // Extract rarities from trait modifier magnitude
    Object.values(itemTypes).forEach((wearable: any) => {
      const sum = (wearable.traitModifiers || []).reduce(
        (acc: number, val: number) => acc + Math.abs(val || 0),
        0
      );
      let rarity = 'common';
      if (sum >= 6) rarity = 'godlike';
      else if (sum >= 5) rarity = 'mythical';
      else if (sum >= 4) rarity = 'legendary';
      else if (sum >= 3) rarity = 'rare';
      else if (sum >= 2) rarity = 'uncommon';
      rarities.add(rarity);
    });

    return rarityOrder.filter((rarity) => rarities.has(rarity));
  };

  // Helper function to determine rarity from price
  const getWearableRarity = (wearable: any): string => {
    const sum = (wearable.traitModifiers || []).reduce(
      (acc: number, val: number) => acc + Math.abs(val || 0),
      0
    );
    if (sum >= 6) return 'godlike';
    if (sum >= 5) return 'mythical';
    if (sum >= 4) return 'legendary';
    if (sum >= 3) return 'rare';
    if (sum >= 2) return 'uncommon';
    return 'common';
  };

  // Get available trait filters
  const getTraitFilters = () => {
    return [
      { key: 'energy', label: 'NRG', index: 0 },
      { key: 'aggression', label: 'AGG', index: 1 },
      { key: 'spookiness', label: 'SPK', index: 2 },
      { key: 'brainSize', label: 'BRN', index: 3 },
    ];
  };

  // Check if wearable has positive modifier for specific trait
  const hasTraitModifier = (wearable: any, traitIndex: number): boolean => {
    const modifiers = wearable.traitModifiers;
    return modifiers && modifiers[traitIndex] && modifiers[traitIndex] !== 0;
  };

  const handleArchetypeClick = (archetype: ArchetypeVM) => {
    setSelectedArchetype(archetype);
    setSelectedSlot('all'); // Reset filters when changing archetype
    setSelectedRarity('all');
    setSelectedTrait('all');
    setSearchQuery('');

    // Find compatible wearables
    const compatible = Object.values(itemTypes).filter((wearable) =>
      isWearableCompatible(wearable, archetype)
    );

    setAllCompatibleWearables(compatible);
    setCompatibleWearables(compatible);
  };

  const applyFilters = (
    slot: string = selectedSlot,
    rarity: string = selectedRarity,
    trait: string = selectedTrait,
    search: string = searchQuery
  ) => {
    let filtered = allCompatibleWearables;

    // Apply slot filter
    if (slot !== 'all') {
      filtered = filtered.filter((wearable) => wearable.slotPositions === slot);
    }

    // Apply rarity filter
    if (rarity !== 'all') {
      filtered = filtered.filter(
        (wearable) => getWearableRarity(wearable) === rarity
      );
    }

    // Apply trait filter
    if (trait !== 'all') {
      const traitInfo = getTraitFilters().find((t) => t.key === trait);
      if (traitInfo) {
        filtered = filtered.filter((wearable) =>
          hasTraitModifier(wearable, traitInfo.index)
        );
      }
    }

    // Apply search filter
    if (search.trim()) {
      filtered = filtered.filter((wearable) =>
        wearable.name.toLowerCase().includes(search.toLowerCase().trim())
      );
    }

    setCompatibleWearables(filtered);
  };

  const handleSlotFilter = (slot: string) => {
    setSelectedSlot(slot);
    applyFilters(slot, selectedRarity, selectedTrait, searchQuery);
  };

  const handleRarityFilter = (rarity: string) => {
    setSelectedRarity(rarity);
    applyFilters(selectedSlot, rarity, selectedTrait, searchQuery);
  };

  const handleTraitFilter = (trait: string) => {
    setSelectedTrait(trait);
    applyFilters(selectedSlot, selectedRarity, trait, searchQuery);
  };

  const handleSearchChange = (search: string) => {
    setSearchQuery(search);
    applyFilters(selectedSlot, selectedRarity, selectedTrait, search);
  };

  const getTraitIcon = (trait: 'high' | 'low') => {
    return trait === 'high' ? '↑' : '↓';
  };

  const getTraitColor = (trait: 'high' | 'low') => {
    return trait === 'high' ? 'text-green-400' : 'text-red-400';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            Aavegotchi Builds
          </h1>
          <p className="text-gray-300 text-lg max-w-3xl mx-auto">
            Explore 16 unique archetypes based on the four core traits: Attack
            Speed, Damage, HP, and Mana. Click on any archetype to see
            compatible wearables.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Archetypes Grid */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white mb-4">Archetypes</h2>
            <div className="max-h-[80vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ARCHETYPES.map((archetype) => (
                  <div
                    key={archetype.name}
                    onClick={() => handleArchetypeClick(archetype)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 hover:scale-105 ${
                      selectedArchetype?.name === archetype.name
                        ? 'bg-purple-800/50 border-purple-400'
                        : 'bg-gray-800/50 border-gray-600 hover:border-purple-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xl font-bold text-white">
                        {archetype.name}
                      </h3>
                      <div className="flex space-x-1 text-sm">
                        <span
                          className={`font-hud ${getTraitColor(archetype.traitProfile.energy)}`}
                        >
                          AS{getTraitIcon(archetype.traitProfile.energy)}
                        </span>
                        <span
                          className={`font-hud ${getTraitColor(archetype.traitProfile.aggression)}`}
                        >
                          DMG{getTraitIcon(archetype.traitProfile.aggression)}
                        </span>
                        <span
                          className={`font-hud ${getTraitColor(archetype.traitProfile.spookiness)}`}
                        >
                          HP{getTraitIcon(archetype.traitProfile.spookiness)}
                        </span>
                        <span
                          className={`font-hud ${getTraitColor(archetype.traitProfile.brainSize)}`}
                        >
                          MN{getTraitIcon(archetype.traitProfile.brainSize)}
                        </span>
                      </div>
                    </div>

                    {/* Character Sprite */}
                    {archetype.spriteName && (
                      <div className="flex justify-center mb-3">
                        <CharacterSprite
                          spriteName={archetype.spriteName}
                          size={200}
                        />
                      </div>
                    )}

                    <p className="text-gray-300 text-sm">
                      {archetype.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Compatible Items Display */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">
                Compatible Items
              </h2>
              {selectedArchetype && (
                <Button
                  onClick={() => {
                    setSelectedArchetype(null);
                    setCompatibleWearables([]);
                    setAllCompatibleWearables([]);
                    setSelectedSlot('all');
                    setSelectedRarity('all');
                    setSelectedTrait('all');
                    setSearchQuery('');
                  }}
                  className="bg-gray-600 hover:bg-gray-700"
                >
                  Clear Selection
                </Button>
              )}
            </div>

            {!selectedArchetype ? (
              <div className="bg-gray-800/50 rounded-lg p-8 text-center">
                <p className="text-gray-400 text-lg">
                  Select an archetype to view compatible wearables
                </p>
              </div>
            ) : (
              <div className="bg-gray-800/50 rounded-lg p-6">
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-white mb-2">
                    {selectedArchetype.name} Compatible Items
                  </h3>
                  <p className="text-gray-300 text-sm mb-3">
                    Found {compatibleWearables.length} compatible wearables
                    {(selectedSlot !== 'all' ||
                      selectedRarity !== 'all' ||
                      selectedTrait !== 'all' ||
                      searchQuery.trim()) &&
                      ' ('}
                    {[
                      selectedSlot !== 'all' ? selectedSlot : null,
                      selectedRarity !== 'all' ? selectedRarity : null,
                      selectedTrait !== 'all'
                        ? getTraitFilters().find((t) => t.key === selectedTrait)
                            ?.label
                        : null,
                      searchQuery.trim() ? `"${searchQuery.trim()}"` : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    {(selectedSlot !== 'all' ||
                      selectedRarity !== 'all' ||
                      selectedTrait !== 'all' ||
                      searchQuery.trim()) &&
                      ')'}
                  </p>

                  {/* Search Bar */}
                  <div className="mb-3">
                    <input
                      type="text"
                      placeholder="Search wearables by name..."
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    />
                  </div>

                  {/* Slot Filter Buttons */}
                  <div className="mb-3">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">
                      Filter by Slot:
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleSlotFilter('all')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          selectedSlot === 'all'
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        All ({allCompatibleWearables.length})
                      </button>
                      {getSlotPositions().map((slot) => {
                        const count = allCompatibleWearables.filter(
                          (w) => w.slotPositions === slot
                        ).length;
                        if (count === 0) return null;

                        return (
                          <button
                            key={slot}
                            onClick={() => handleSlotFilter(slot)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                              selectedSlot === slot
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {slot} ({count})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rarity Filter Buttons */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">
                      Filter by Rarity:
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleRarityFilter('all')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          selectedRarity === 'all'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        All ({allCompatibleWearables.length})
                      </button>
                      {getRarities().map((rarity) => {
                        const count = allCompatibleWearables.filter(
                          (w) => getWearableRarity(w) === rarity
                        ).length;
                        if (count === 0) return null;

                        const getRarityColor = (rarity: string) => {
                          switch (rarity) {
                            case 'common':
                              return 'bg-gray-600 text-gray-100';
                            case 'uncommon':
                              return 'bg-green-600 text-green-100';
                            case 'rare':
                              return 'bg-blue-600 text-blue-100';
                            case 'legendary':
                              return 'bg-yellow-600 text-yellow-100';
                            case 'mythical':
                              return 'bg-red-600 text-red-100';
                            case 'godlike':
                              return 'bg-pink-600 text-pink-100';
                            default:
                              return 'bg-gray-600 text-gray-100';
                          }
                        };

                        return (
                          <button
                            key={rarity}
                            onClick={() => handleRarityFilter(rarity)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                              selectedRarity === rarity
                                ? getRarityColor(rarity)
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {rarity} ({count})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Trait Filter Buttons */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">
                      Filter by Trait:
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleTraitFilter('all')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          selectedTrait === 'all'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        All ({allCompatibleWearables.length})
                      </button>
                      {getTraitFilters().map((trait) => {
                        const count = allCompatibleWearables.filter((w) =>
                          hasTraitModifier(w, trait.index)
                        ).length;
                        if (count === 0) return null;

                        const getTraitColor = (traitKey: string) => {
                          switch (traitKey) {
                            case 'energy':
                              return 'bg-yellow-600 text-yellow-100';
                            case 'aggression':
                              return 'bg-red-600 text-red-100';
                            case 'spookiness':
                              return 'bg-purple-600 text-purple-100';
                            case 'brainSize':
                              return 'bg-blue-600 text-blue-100';
                            default:
                              return 'bg-gray-600 text-gray-100';
                          }
                        };

                        return (
                          <button
                            key={trait.key}
                            onClick={() => handleTraitFilter(trait.key)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              selectedTrait === trait.key
                                ? getTraitColor(trait.key)
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {trait.label} ({count})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto space-y-2">
                  {compatibleWearables.length === 0 ? (
                    <p className="text-gray-400 text-center py-4">
                      {(() => {
                        const activeFilters = [];
                        if (selectedSlot !== 'all')
                          activeFilters.push(selectedSlot);
                        if (selectedRarity !== 'all')
                          activeFilters.push(selectedRarity);
                        if (selectedTrait !== 'all') {
                          const traitLabel = getTraitFilters().find(
                            (t) => t.key === selectedTrait
                          )?.label;
                          if (traitLabel) activeFilters.push(traitLabel);
                        }

                        if (activeFilters.length === 0) {
                          return 'No compatible wearables found for this archetype.';
                        } else {
                          return `No compatible items found with filters: ${activeFilters.join(', ')}.`;
                        }
                      })()}
                    </p>
                  ) : (
                    compatibleWearables.map((wearable) => (
                      <div
                        key={wearable.svgId}
                        className="bg-gray-700/50 rounded-lg border border-gray-600 flex overflow-hidden"
                      >
                        {/* Left side image */}
                        <div className="flex-shrink-0 w-20 bg-gray-800 flex items-center justify-center">
                          <img
                            src={`/wearables/${wearable.svgId}.svg`}
                            alt={wearable.name}
                            className="w-16 h-16 object-contain"
                            onError={(e) => {
                              // Fallback to a placeholder if image doesn't exist
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>

                        {/* Right side content */}
                        <div className="flex-1 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-white font-semibold">
                              {wearable.name}
                            </h4>
                            <div className="flex items-center space-x-2">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${(() => {
                                  const rarity = getWearableRarity(wearable);
                                  switch (rarity) {
                                    case 'common':
                                      return 'bg-gray-600 text-gray-100';
                                    case 'uncommon':
                                      return 'bg-green-600 text-green-100';
                                    case 'rare':
                                      return 'bg-blue-600 text-blue-100';
                                    case 'legendary':
                                      return 'bg-yellow-600 text-yellow-100';
                                    case 'mythical':
                                      return 'bg-red-600 text-red-100';
                                    case 'godlike':
                                      return 'bg-pink-600 text-pink-100';
                                    default:
                                      return 'bg-gray-600 text-gray-100';
                                  }
                                })()}`}
                              >
                                {getWearableRarity(wearable)}
                              </span>
                              <span className="text-purple-300 text-sm">
                                #{wearable.svgId}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">
                              {wearable.slotPositions || 'No slot'}
                            </span>
                            <div className="flex space-x-2">
                              {wearable.traitModifiers &&
                                wearable.traitModifiers.map(
                                  (modifier: number, index: number) => {
                                    if (modifier === 0) return null;
                                    const traits = ['NRG', 'AGG', 'SPK', 'BRN'];
                                    const sign = modifier > 0 ? '+' : '';
                                    return (
                                      <span
                                        key={index}
                                        className={`text-xs px-1 py-0.5 rounded ${
                                          modifier > 0
                                            ? 'bg-green-800 text-green-200'
                                            : 'bg-red-800 text-red-200'
                                        }`}
                                      >
                                        {traits[index]} {sign}
                                        {modifier}
                                      </span>
                                    );
                                  }
                                )}
                            </div>
                          </div>

                          {wearable.description && (
                            <p className="text-gray-400 text-xs mt-1">
                              {wearable.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-8 bg-gray-800/30 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-3">Trait Legend</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-green-400 font-hud">AS↑</span>
              <span className="text-white ml-2">High Attack Speed</span>
            </div>
            <div>
              <span className="text-green-400 font-hud">DMG↑</span>
              <span className="text-white ml-2">High Damage</span>
            </div>
            <div>
              <span className="text-green-400 font-hud">HP↑</span>
              <span className="text-white ml-2">High HP</span>
            </div>
            <div>
              <span className="text-green-400 font-hud">MN↑</span>
              <span className="text-white ml-2">High Mana</span>
            </div>
            <div>
              <span className="text-red-400 font-hud">AS↓</span>
              <span className="text-white ml-2">Low Attack Speed</span>
            </div>
            <div>
              <span className="text-red-400 font-hud">DMG↓</span>
              <span className="text-white ml-2">Low Damage</span>
            </div>
            <div>
              <span className="text-red-400 font-hud">HP↓</span>
              <span className="text-white ml-2">Low HP</span>
            </div>
            <div>
              <span className="text-red-400 font-hud">MN↓</span>
              <span className="text-white ml-2">Low Mana</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
