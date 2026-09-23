// jest.setup.js
//
// AsyncStorage is a native module, so under jest it resolves to null and any
// import of lib/supabase throws before a test runs. The package ships an
// official in-memory mock for exactly this.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
