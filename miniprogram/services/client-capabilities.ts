// Optional API features supported by this mini-program build. Older released
// clients omit the header, so the server can keep their responses conservative.
export const clientCapabilityHeaders = {
  "X-Doubo-Capabilities": [
    "visitor-browse-v1",
    "video-token-pricing-v1",
    "reference-video-billing-v1",
  ].join(","),
};
