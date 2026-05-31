alter table token_withdrawals
  alter column amount_base_units
  type numeric(78, 0)
  using amount_base_units::numeric;
