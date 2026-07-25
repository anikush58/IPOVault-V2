const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Support .wasm files required by expo-sqlite on web
config.resolver.assetExts.push('wasm');

// Exclude expo-document-picker's temporary Maven repo directories that Metro
// tries to watch but don't fully exist after postinstall on this platform.
config.resolver.blockList = /node_modules\/.*_tmp_.*\/local-maven-repo\/.*/;

module.exports = config;
