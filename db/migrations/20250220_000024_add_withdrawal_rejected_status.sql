-- Add withdrawal_rejected status to token_withdrawal_status enum
do $$
begin
  alter type token_withdrawal_status add value if not exists 'withdrawal_rejected';
exception
  when duplicate_object then null;
end$$;
