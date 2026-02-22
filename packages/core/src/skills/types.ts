export interface LoadedSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  content: string;
  tools: string[];
  alwaysLoad: boolean;
  inputModes: string[];
  outputModes: string[];
}
