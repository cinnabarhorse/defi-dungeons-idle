import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeverageBreakdownButton } from '../components/runs/leverage-breakdown-button';

describe('LeverageBreakdownButton', () => {
  it('opens a leverage breakdown dialog with legacy and trade values', async () => {
    const user = userEvent.setup();

    render(
      <LeverageBreakdownButton
        leverageTotal={9}
        legacyLeverage={5}
        tradeRunLeverage={4}
        tradeRunToken="GHST"
        tradeRunDirection="long"
      />
    );

    await user.click(screen.getByRole('button', { name: '9.0x' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Leverage Breakdown')).toBeInTheDocument();
    expect(screen.getByText('5.0x + 4.0x = 9.0x')).toBeInTheDocument();
    expect(screen.getByText('Legacy leverage')).toBeInTheDocument();
    expect(screen.getByText('Trade run')).toBeInTheDocument();
    expect(screen.getByText('GHST Up 4.0x')).toBeInTheDocument();
    expect(screen.getByText('Total leverage')).toBeInTheDocument();
  });

  it('defaults missing trade leverage to 0.0x in the breakdown', async () => {
    const user = userEvent.setup();

    render(
      <LeverageBreakdownButton leverageTotal={6} legacyLeverage={6} />
    );

    await user.click(screen.getByRole('button', { name: '6.0x' }));

    expect(screen.getByText('6.0x + 0.0x = 6.0x')).toBeInTheDocument();
  });
});
