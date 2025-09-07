-- Export current user data from local database
-- Run this before migrating to Supabase

-- Export user_settings
\copy (SELECT * FROM user_settings) TO '/tmp/user_settings_export.csv' WITH CSV HEADER;

-- Export bot_states  
\copy (SELECT * FROM bot_states) TO '/tmp/bot_states_export.csv' WITH CSV HEADER;

-- Export trades
\copy (SELECT * FROM trades) TO '/tmp/trades_export.csv' WITH CSV HEADER;

-- Verify exports
SELECT 'user_settings' as table_name, COUNT(*) as row_count FROM user_settings
UNION ALL
SELECT 'bot_states', COUNT(*) FROM bot_states  
UNION ALL
SELECT 'trades', COUNT(*) FROM trades;