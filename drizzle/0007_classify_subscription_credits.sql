UPDATE "credit_ledger"
SET "type" = 'subscription_credit'
WHERE "type" = 'purchase'
  AND "note" LIKE '%créditos mensuales incluidos';
