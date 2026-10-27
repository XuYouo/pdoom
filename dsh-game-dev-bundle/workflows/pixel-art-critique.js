// Run only on an exported immutable preview, never concurrently edit Aseprite.
if (typeof args.preview !== 'string' || typeof args.brief !== 'string') {
  throw new Error('Provide args.preview (an anonymized image path) and args.brief.');
}
phase('Cold read');
const cold = await agent(
  `Read-only visual recognition. Open this image with read_image: ${JSON.stringify(args.preview)}. Do not inspect neighboring files, metadata, source documents or any brief. State the subject you actually see and the three places your eye lands first. If you cannot see the image, say so. Do not edit anything.`,
  { label: 'Unprimed visual reader', schema: { type: 'object', properties: {
    imageSeen: { type: 'boolean' }, subject: { type: 'string' }, focalPoints: { type: 'array', items: { type: 'string' } }
  }, required: ['imageSeen', 'subject', 'focalPoints'], additionalProperties: false } }
);
if (!cold || !cold.imageSeen) return { incomplete: true, cold, critique: null };
phase('Brief-aware critique');
const critique = await agent(
  `Read-only pixel-art QA. Preview: ${JSON.stringify(args.preview)}. Open the image yourself. The frozen independent cold read is ${JSON.stringify(cold)}. Now compare with the user brief: ${JSON.stringify(args.brief)}. Load game-dev-workflows and review; read relevant rule chapters. Do not modify documents, call mutating MCP tools, or publish anything. Report blocking recognition failures separately from mechanical/style issues, with locations and cited rules. Do not pretend a still image proves animation quality.`,
  { label: 'Brief-aware critic' }
);
return { incomplete: critique === null, cold, critique };
