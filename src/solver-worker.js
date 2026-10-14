import Cube from 'cubejs';

let initialized = false;
self.onmessage = ({ data }) => {
  try {
    if (!initialized) {
      Cube.initSolver();
      initialized = true;
    }
    const solution = Cube.fromString(data).solve();
    self.postMessage({ solution });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};