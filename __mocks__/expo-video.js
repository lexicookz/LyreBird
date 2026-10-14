// __mocks__/expo-video.js
// expo-video's player is a native module that doesn't exist in the Jest
// environment. These stand-ins let screens that play video load and render in
// tests: the player records play/pause, and VideoView renders an empty View
// that keeps its props (so tests can find it by testID).

const React = require('react');
const { View } = require('react-native');

function useVideoPlayer(source, setup) {
  const player = React.useMemo(() => {
    const p = { source, loop: false, playing: false, play: jest.fn(() => { p.playing = true; }), pause: jest.fn(() => { p.playing = false; }), replace: jest.fn(), replaceAsync: jest.fn(async () => {}) };
    if (setup) setup(p);
    return p;
  }, [source]);
  return player;
}

function VideoView(props) {
  return React.createElement(View, props);
}

module.exports = { useVideoPlayer, VideoView };
