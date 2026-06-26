# Scopes module (AI scope generation)

Reads a room's notes/photos/readings/dimensions and produces an IICRC-aligned,
room-by-room scope (narrative + line items) with S500/S520/S700 citations.

Architecture = VoiceAI Connect orchestration pattern: Claude + IICRC corpus
(retrieval context) + a validation pass that refuses to invent line items.
Server-side only (API key off the client): calls POST /api/scope.

Cost discipline: Haiku for extraction/drafts, Sonnet for final scope, cache corpus.
Output feeds (a) the report narrative and (b) the ESX line items.
