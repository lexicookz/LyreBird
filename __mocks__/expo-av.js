// __mocks__/expo-av.js
// expo-av relies on a native module that doesn't exist in the Jest test
// environment. This mock provides harmless stand-ins so files that import
// it (like ImportScreen) don't crash when loaded in tests.

module.exports = {
    ResizeMode: {
        COVER: 'cover',
        CONTAIN: 'contain',
        STRETCH: 'stretch',
    },
    Video: () => null,
};