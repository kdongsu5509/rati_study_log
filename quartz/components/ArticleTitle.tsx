import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { getDate } from "./Date"

const NEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

const ArticleTitle: QuartzComponent = ({ fileData, displayClass, cfg }: QuartzComponentProps) => {
  const title = fileData.frontmatter?.title
  if (!title) return null

  const date = fileData.dates ? getDate(cfg, fileData) : null
  const isNew = date ? Date.now() - date.getTime() < NEW_THRESHOLD_MS : false

  return (
    <h1 class={classNames(displayClass, "article-title")}>
      {title}
      {isNew && <span class="new-badge">NEW</span>}
    </h1>
  )
}

ArticleTitle.css = `
.article-title {
  margin: 2rem 0 0 0;
}

.article-title .new-badge {
  display: inline-block;
  margin-left: 0.6rem;
  padding: 0.15rem 0.5rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--light);
  background: var(--secondary);
  border-radius: 4px;
  vertical-align: middle;
  text-transform: uppercase;
}
`

export default (() => ArticleTitle) satisfies QuartzComponentConstructor
