import type { ChannelGroup } from '@/lib/discordApi';

export type { ChannelGroup };

/** Native select (accessible, keyboard-searchable) grouped by Discord category. */
export function ChannelSelect({
  groups,
  emptyLabel,
  ...props
}: {
  id: string;
  name: string;
  groups: ChannelGroup[];
  defaultValue: string;
  emptyLabel: string;
  className?: string;
}) {
  return (
    <select {...props}>
      <option value="">{emptyLabel}</option>
      {groups.map((group) =>
        group.category ? (
          <optgroup key={group.category} label={group.category}>
            {group.channels.map((c) => (
              <option key={c.id} value={c.id}>
                # {c.name}
              </option>
            ))}
          </optgroup>
        ) : (
          group.channels.map((c) => (
            <option key={c.id} value={c.id}>
              # {c.name}
            </option>
          ))
        ),
      )}
    </select>
  );
}
