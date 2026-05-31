export interface DialogueResponse<K extends string> {
  text: string;
  nextDialogue: K | `action:${string}` | 'end';
}

export interface DialogueNode<K extends string> {
  text: string;
  responses: Array<DialogueResponse<K>>;
}

export interface NpcDialogueSpec<T extends Record<string, DialogueNode<string & keyof T>>> {
  npcId: string;
  npcName: string;
  dialogues: T;
}

export function defineNpcDialogue<T extends Record<string, DialogueNode<string & keyof T>>>(
  spec: {
    npcId: string;
    npcName: string;
    dialogues: T;
  }
): {
  npcId: string;
  npcName: string;
  dialogues: T;
} {
  return spec as {
    npcId: string;
    npcName: string;
    dialogues: T;
  };
}

export function toRuntimeJson<T extends Record<string, DialogueNode<string & keyof T>>>(
  spec: {
    npcId: string;
    npcName: string;
    dialogues: T;
  }
) {
  return {
    npcId: spec.npcId,
    npcName: spec.npcName,
    dialogues: Object.fromEntries(
      Object.entries(spec.dialogues as Record<string, DialogueNode<string>>).map(
        ([key, node]) => [
          key,
          {
            text: node.text,
            responses: node.responses.map((r) => ({
              text: r.text,
              nextDialogue: r.nextDialogue,
            })),
          },
        ]
      )
    ),
  };
}
