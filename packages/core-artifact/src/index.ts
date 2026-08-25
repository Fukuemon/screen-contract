export {
  DEFAULT_BADGE_STYLE,
  layoutBadges,
  type BadgeLayout,
  type BadgeLayoutInput,
  type BadgePlacement,
  type BadgeStyle,
  type BadgeWarning,
  type BadgeWarningReason,
} from "./badge.js";
export {
  decideArtifacts,
  decideRawImage,
  decideTextArtifact,
  type ArtifactMeta,
  type ChangeDecision,
  type GateExisting,
  type GateInput,
  type GateResult,
} from "./gate.js";
export {
  annotatedImageName,
  ArtifactPathError,
  assertOutputPath,
  assertResolvedWithinRoot,
  defaultArtifactDir,
  parseArtifactSegment,
  rawImageName,
  type ArtifactSegment,
  type PathRejection,
} from "./paths.js";
export {
  DEFAULT_BADGE_FILL,
  DEFAULT_BADGE_TEXT_COLOR,
  escapeXml,
  renderAnnotatedImage,
  type AnnotatedImageInput,
} from "./svg.js";
export {
  escapeCell,
  escapeLinkText,
  renderElementTable,
  type TableInput,
  type TableOutput,
  type TableWarning,
  type TableWarningReason,
} from "./table.js";
