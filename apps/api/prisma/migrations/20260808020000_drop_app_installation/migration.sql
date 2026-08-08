-- Retire the Marketplace façade: the AppInstallation table only stored a
-- fake install toggle that nothing in the app consumed. The Marketplace is
-- replaced by a real integrations directory derived from live config.
DROP TABLE IF EXISTS "AppInstallation";
