import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CraftingMenu } from '../components/crafting/crafting-menu';
import { usePlayer } from '../components/providers/PlayerProvider';

jest.mock('../components/providers/PlayerProvider', () => ({
  usePlayer: jest.fn(),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    src,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} {...props} />
  ),
}));

jest.mock('framer-motion', () => {
  const React = require('react');
  const MotionDiv = React.forwardRef(
    (
      props: React.HTMLAttributes<HTMLDivElement>,
      ref: React.ForwardedRef<HTMLDivElement>
    ) => <div ref={ref} {...props} />
  );
  MotionDiv.displayName = 'MockMotionDiv';

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: MotionDiv,
    },
  };
});

const mockedUsePlayer = usePlayer as jest.MockedFunction<typeof usePlayer>;
const mockRefreshInventory = jest.fn();
const mockRefreshEquipment = jest.fn();
const mockRefreshProgression = jest.fn();
const fetchMock = jest.fn();

const originalFetch = global.fetch;

describe('CraftingMenu forge summary', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as any;
    mockRefreshInventory.mockReset().mockResolvedValue(undefined);
    mockRefreshEquipment.mockReset().mockResolvedValue(undefined);
    mockRefreshProgression.mockReset().mockResolvedValue(undefined);

    mockedUsePlayer.mockReturnValue({
      effectivePreferences: {
        selectedCharacterId: 'gotchi:1',
      },
      arePreferencesHydrated: true,
      lickTongueCount: 347,
      refreshProgression: mockRefreshProgression,
      equipment: {
        state: {
          characterId: 'gotchi:1',
          equippedInventoryItemIds: [],
        },
        refresh: mockRefreshEquipment,
      },
      inventory: {
        refreshInventory: mockRefreshInventory,
        inventoryItems: [
          {
            id: 'gold-1',
            name: 'Gold',
            type: 'coin',
            quantity: 5018,
          },
          {
            id: 'sushi-1',
            inventoryItemId: 'sushi-1',
            name: 'Sushi Knife',
            type: 'wearable',
            quantity: 1,
            color: '#fff',
            wearableSlug: 'sushi-knife',
            quality: 'average',
            durabilityScore: 400,
          },
        ],
      },
      gotchiSprites: {
        isLoading: false,
        byId: {
          1: {
            id: 1,
            equippedWearables: [83],
          },
        },
      },
    } as any);
  });

  afterEach(() => {
    mockedUsePlayer.mockReset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('shows only icon-based gold and lick tongue balances in the forge summary', async () => {
    const user = userEvent.setup();

    render(
      <CraftingMenu
        open
        onOpenChange={() => {}}
        serverBaseUrl="http://localhost:3001"
        preferredTab="forge"
      />
    );

    const summary = screen.getByTestId('forge-balance-summary');

    expect(within(summary).getByAltText('Gold')).toBeInTheDocument();
    expect(within(summary).getByText('5018')).toBeInTheDocument();
    expect(within(summary).getByAltText('Lick Tongue')).toBeInTheDocument();
    expect(within(summary).getByText('347')).toBeInTheDocument();
    expect(screen.queryByText(/Selected gotchi Gold:/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Available Lick Tongues:/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Forge consumes one owned source copy/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Lower-quality sources have lower success rates/i)
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /how flawless forging works/i })
    );

    expect(
      screen.getByText(
        /Flawless wearables can be forged using the NFT version \+ a copy, which gets consumed\./i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /They can only be equipped on real onchain Aavegotchis\./i
      )
    ).toBeInTheDocument();
  });

  it('opens directly on the forge tab when preferredTab is forge', () => {
    render(
      <CraftingMenu
        open
        onOpenChange={() => {}}
        serverBaseUrl="http://localhost:3001"
        preferredTab="forge"
      />
    );

    expect(screen.getByTestId('forge-balance-summary')).toBeInTheDocument();
    expect(screen.queryByText('Your Potions')).not.toBeInTheDocument();
  });

  it('celebrates a successful forge with an over-the-top victory card and shake state', async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        outcome: 'success',
        goldSpent: 800,
        successChancePct: 13,
        lickTonguesSpent: 25,
        sourceQuality: 'average',
      }),
    });

    render(
      <CraftingMenu
        open
        onOpenChange={() => {}}
        serverBaseUrl="http://localhost:3001"
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Flawless Wearables' })
    );
    await user.click(screen.getByRole('button', { name: /Roll for/i }));

    const celebration = await screen.findByTestId('forge-success-celebration');

    expect(celebration).toHaveTextContent(/FLAWLESS!/i);
    expect(celebration).toHaveTextContent(/Sushi Knife/i);
    expect(celebration).toHaveTextContent(/13%/i);
    expect(celebration).not.toHaveTextContent(/800 Gold/i);
    expect(celebration).not.toHaveTextContent(/25 Lick Tongues/i);
    expect(screen.getByTestId('crafting-menu-shell')).toHaveAttribute(
      'data-forge-celebrating',
      'true'
    );

    await waitFor(() => {
      expect(mockRefreshInventory).toHaveBeenCalledWith(true);
      expect(mockRefreshEquipment).toHaveBeenCalled();
      expect(mockRefreshProgression).toHaveBeenCalled();
    });
  });

  it('uses mobile-friendly stacked layouts for forge cards and the success state', async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        outcome: 'success',
        goldSpent: 800,
        successChancePct: 13,
        lickTonguesSpent: 25,
        sourceQuality: 'average',
      }),
    });

    render(
      <CraftingMenu
        open
        onOpenChange={() => {}}
        serverBaseUrl="http://localhost:3001"
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Flawless Wearables' })
    );

    const candidateLayout = screen.getByTestId(
      'forge-candidate-layout-sushi-knife'
    );
    const candidateAction = screen.getByTestId(
      'forge-candidate-action-sushi-knife'
    );
    const rollButton = screen.getByRole('button', { name: /Roll for/i });

    expect(candidateLayout).toHaveClass('flex-col');
    expect(candidateLayout).toHaveClass('md:flex-row');
    expect(candidateAction).toHaveClass('w-full');
    expect(candidateAction).toHaveClass('md:w-auto');
    expect(rollButton).toHaveClass('w-full');

    await user.click(rollButton);

    const successLayout = await screen.findByTestId('forge-success-layout');
    const successIcon = screen.getByTestId('forge-success-icon');

    expect(successLayout).toHaveClass('flex-col');
    expect(successLayout).toHaveClass('sm:flex-row');
    expect(successIcon).toHaveClass('self-start');
    expect(successIcon).toHaveClass('sm:self-auto');
  });
});
