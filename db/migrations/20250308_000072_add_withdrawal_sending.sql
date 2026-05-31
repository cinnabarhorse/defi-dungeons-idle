-- Add in-flight status and timestamp for withdrawal sends
alter type public.token_withdrawal_status
add value if not exists 'withdrawal_sending';

alter table public.token_withdrawals
  add column if not exists withdrawal_sending_at timestamptz;
