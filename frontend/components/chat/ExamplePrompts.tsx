const EXAMPLE_PROMPTS = [
  'Quais produtos sem açúcar estão disponíveis no México?',
  'Show me cleaning products from Unilever available in Netherlands',
  'Quais bebidas estão disponíveis no Brasil?',
];

interface ExamplePromptsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function ExamplePrompts({ onSelect, disabled }: ExamplePromptsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-xs text-gray-500 self-center">Experimente:</span>
      {EXAMPLE_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          onClick={() => onSelect(prompt)}
          disabled={disabled}
          className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
