const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The engineer app imports the one authoritative pure job contract.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../backend/shared')];

module.exports = config;
