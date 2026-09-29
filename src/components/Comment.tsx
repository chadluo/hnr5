import { type HNComment, getHNComment } from "@/lib/hn";
import { usePostHog } from "@posthog/react";
import classNames from "classnames";
import * as React from "react";

const BATCH_SIZE = 10;

type Props = {
  commentId: number;
  isExpanded: boolean;
  isTop: boolean;
  isShowing: boolean;
  index?: number;
  hasStoryText?: boolean;
};

type CommentListProps = {
  kids: number[];
  isShowing: boolean;
  isTop: boolean;
  isExpanded?: boolean;
  hasStoryText?: boolean;
};

export function CommentList({
  kids,
  isShowing,
  isTop,
  isExpanded,
  hasStoryText,
}: CommentListProps) {
  const posthog = usePostHog();
  const [visibleCount, setVisibleCount] = React.useState(BATCH_SIZE);
  const visibleKids = kids.slice(0, visibleCount);
  const hasMore = visibleCount < kids.length;

  return (
    <>
      {visibleKids.map((kid, index) => (
        <Comment
          key={kid}
          commentId={kid}
          isExpanded={isExpanded ?? !isTop}
          isTop={isTop}
          isShowing={isShowing}
          index={index}
          hasStoryText={hasStoryText}
        />
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => {
            setVisibleCount((c) => c + BATCH_SIZE);
            posthog?.capture("comments_load_more_clicked", {
              comments_remaining: kids.length - visibleCount,
              nesting_level: isTop ? "top_level" : "reply",
            });
          }}
          className={classNames(
            "my-2 cursor-pointer rounded bg-transparent px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 active:bg-neutral-600",
            { "ml-8": !isTop },
          )}
        >
          Load more ({kids.length - visibleCount} remaining)
        </button>
      )}
    </>
  );
}

export const EmptyComment = () => (
  <span className="italic">No comments yet.</span>
);

export function Comment(props: Props) {
  const { commentId, index, isExpanded, isTop, isShowing, hasStoryText } =
    props;

  const [comment, setComment] = React.useState<HNComment>();
  const [isLocalShowing, setLocalShowing] = React.useState(isShowing);

  React.useEffect(() => {
    const controller = new AbortController();
    if (isShowing) {
      getHNComment(commentId, controller).then(setComment).catch(console.error);
    } else {
      try {
        controller.abort("Aborted loading comment");
      } catch (err) {
        console.error(err);
      }
    }
    return () => {
      try {
        controller.abort("Aborted loading comment");
      } catch (err) {
        console.error(err);
      }
    };
  }, [commentId, isShowing]);

  if (!comment) {
    return <></>;
  }

  const { text, by, kids, deleted, dead } = comment;

  return !deleted && !dead ? (
    <details
      data-commentid={commentId}
      data-kids={kids}
      open={isExpanded}
      onToggle={(event) => {
        if ((event.target as HTMLDetailsElement).open && !isLocalShowing) {
          setLocalShowing(true);
        }
      }}
      className={classNames(
        {
          "pl-8": !isTop,
          "border-t border-neutral-600 pt-2":
            isTop && (hasStoryText || index !== 0),
          // dim every other comment in the tree while one is hovered
          "[&:has(summary:hover)_summary:not(:hover)]:opacity-50": isTop,
        },
        "[&_a]:wrap-break-word [&_a]:text-[#f60] [&_a:hover]:text-[#f0a675]",
        // direct parent of the hovered comment; :not(:hover) keeps specificity above the 50% rule
        "[&:has(>details>summary:hover)>summary:not(:hover)]:opacity-70",
        "[&_p]:mt-2",
        "[&_pre]:mb-2 [&_pre]:overflow-x-auto [&_pre]:text-sm [&_pre]:leading-6",
      )}
    >
      <summary
        className={classNames("pb-2 transition-opacity duration-200", {
          "list-none": !kids,
        })}
        dangerouslySetInnerHTML={{
          __html: `${text} [<a target="_blank" href="https://news.ycombinator.com/item?id=${commentId}">${by}</a>]`,
        }}
      />
      {isShowing && kids && (
        <CommentList kids={kids} isShowing={isLocalShowing} isTop={false} />
      )}
    </details>
  ) : (
    <></>
  );
}
