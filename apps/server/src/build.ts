/** Commit the server was built from (BUILD_ID, set by the Docker build in CI); "dev" when run locally. */
export const BUILD_ID = process.env.BUILD_ID || "dev";
