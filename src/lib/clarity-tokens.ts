/**
 * Which env var holds the export token for a Clarity project.
 * Adding a project is one line. A project with no line is skipped.
 * brandmultiplier.ai is k0r7x8mkc7. chrisrubincreativ.com is yv4cy3vjqc.
 * chrisrubin.com is zc0y67nz88.
 */
export const CLARITY_PROJECT_TOKENS: Record<string, string> = {
  k0r7x8mkc7: "CLARITY_API_TOKEN",
  yv4cy3vjqc: "CLARITY_API_TOKEN_CRC",
  zc0y67nz88: "CLARITY_API_TOKEN_CHRISRUBIN",
};
