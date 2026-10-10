import { youTubeId } from "@/lib/play-ports";
import styles from "./TrailerSection.module.css";

/**
 * Card D-P3 — "Watch trailer". Renders one embed when the description (or the developer README) carries a
 * real YouTube/Vimeo link, and nothing at all when it does not — real detection, never a placeholder player.
 * A YouTube link becomes a privacy-friendly `youtube-nocookie` embed; any other link is a plain external
 * link, so the page never frames a non-video URL.
 */
export default function TrailerSection({ url }: { url: string | null }) {
  if (url === null) return null;
  const videoId = youTubeId(url);
  const embed = videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;

  return (
    <section className={styles.section} aria-labelledby="trailer-heading">
      <h2 id="trailer-heading" className={styles.heading}>
        Trailer
      </h2>
      {embed ? (
        <div className={styles.frame}>
          <iframe
            src={embed}
            title="App trailer"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <a className={styles.link} href={url} target="_blank" rel="noopener noreferrer">
          Watch the trailer
        </a>
      )}
    </section>
  );
}
