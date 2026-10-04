import { INSTRUCTION_PROMPT_MARKER } from "../shared/instructions";
import type { InstructionTopology } from "../shared/settings";

export interface CommandInstructionPreferences {
  injectCommandInstructions: boolean;
  instructionTopology: InstructionTopology;
  localDaemonInstructions: string;
  clientServerInstructions: string;
}

export function selectedCommandInstructions(values: CommandInstructionPreferences): string | null {
  if (!values.injectCommandInstructions) return null;
  const text =
    values.instructionTopology === "local-daemon"
      ? values.localDaemonInstructions
      : values.clientServerInstructions;
  return text.trim() || null;
}

export function injectCommandInstructions(
  systemPrompt: string | undefined,
  instructions: string,
): string {
  const existing = systemPrompt?.trim() ?? "";
  if (existing.includes(INSTRUCTION_PROMPT_MARKER)) return existing;
  const addition = `<${INSTRUCTION_PROMPT_MARKER}>\n${instructions.trim()}\n</${INSTRUCTION_PROMPT_MARKER}>`;
  return existing ? `${existing}\n\n${addition}` : addition;
}
