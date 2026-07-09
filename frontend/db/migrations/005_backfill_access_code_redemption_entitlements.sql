-- Backfill user entitlements for access-code redemptions created before
-- redemption updated users.tier and users.features directly.

WITH redemption_tiers AS (
  SELECT
    user_id,
    max(
      CASE tier_granted
        WHEN 'business' THEN 2
        WHEN 'pro' THEN 1
        WHEN 'basic' THEN 0
        ELSE NULL
      END
    ) AS tier_rank
  FROM access_code_redemptions
  GROUP BY user_id
),
first_redemption_features AS (
  SELECT DISTINCT ON (redemption.user_id, feature.value)
    redemption.user_id,
    feature.value AS feature,
    redemption.redeemed_at,
    redemption.id,
    feature.position
  FROM access_code_redemptions redemption
  CROSS JOIN LATERAL jsonb_array_elements_text(redemption.features_granted)
    WITH ORDINALITY AS feature(value, position)
  ORDER BY
    redemption.user_id,
    feature.value,
    redemption.redeemed_at,
    redemption.id,
    feature.position
),
redemption_features AS (
  SELECT
    user_id,
    jsonb_agg(feature ORDER BY redeemed_at, id, position) AS features
  FROM first_redemption_features
  GROUP BY user_id
),
redemption_entitlements AS (
  SELECT
    coalesce(redemption_tiers.user_id, redemption_features.user_id) AS user_id,
    redemption_tiers.tier_rank,
    coalesce(redemption_features.features, '[]'::jsonb) AS features
  FROM redemption_tiers
  FULL OUTER JOIN redemption_features USING (user_id)
)
UPDATE users
SET
  tier = CASE greatest(
      CASE users.tier
        WHEN 'business' THEN 2
        WHEN 'pro' THEN 1
        ELSE 0
      END,
      coalesce(redemption_entitlements.tier_rank, 0)
    )
    WHEN 2 THEN 'business'
    WHEN 1 THEN 'pro'
    ELSE users.tier
  END,
  features = (
    SELECT coalesce(jsonb_agg(feature ORDER BY first_position), '[]'::jsonb)
    FROM (
      SELECT feature, min(position) AS first_position
      FROM jsonb_array_elements_text(users.features || redemption_entitlements.features)
        WITH ORDINALITY AS merged(feature, position)
      GROUP BY feature
    ) merged_features
  ),
  updated_at = now()
FROM redemption_entitlements
WHERE users.id = redemption_entitlements.user_id
  AND (
    CASE users.tier
      WHEN 'business' THEN 2
      WHEN 'pro' THEN 1
      ELSE 0
    END < coalesce(redemption_entitlements.tier_rank, 0)
    OR NOT users.features @> redemption_entitlements.features
  );
