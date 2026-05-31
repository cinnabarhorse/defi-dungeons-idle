import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LobbyAnnouncementBar } from '../components/LobbyAnnouncementBar';

describe('LobbyAnnouncementBar', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the forge launch announcement with an underlined hyperlink', () => {
    render(
      <LobbyAnnouncementBar
        id="forge-launch"
        message="Forging Flawless wearables now live!"
        linkHref="/?openPanel=forge"
        linkLabel="Try it now"
      />
    );

    expect(
      screen.getByText('Forging Flawless wearables now live!')
    ).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'Try it now' });
    expect(link).toHaveAttribute('href', '/?openPanel=forge');
    expect(link.className).toContain('underline');
    expect(screen.getByTestId('lobby-announcement-bar')).toHaveClass(
      'items-center'
    );
    expect(screen.getByTestId('lobby-announcement-bar')).not.toHaveClass(
      'items-start'
    );
  });

  it('lets the user dismiss the bar and keeps it hidden on rerender', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <LobbyAnnouncementBar
        id="forge-launch"
        message="Forging Flawless wearables now live!"
        linkHref="/?openPanel=forge"
        linkLabel="Try it now"
      />
    );

    await user.click(
      screen.getByRole('button', { name: /dismiss announcement/i })
    );

    expect(
      screen.queryByTestId('lobby-announcement-bar')
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem('dd-dismissed-announcement:forge-launch')).toBe(
      '1'
    );

    rerender(
      <LobbyAnnouncementBar
        id="forge-launch"
        message="Forging Flawless wearables now live!"
        linkHref="/?openPanel=forge"
        linkLabel="Try it now"
      />
    );

    expect(
      screen.queryByTestId('lobby-announcement-bar')
    ).not.toBeInTheDocument();
  });
});
