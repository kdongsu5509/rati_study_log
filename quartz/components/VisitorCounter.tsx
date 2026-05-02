import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

interface Options {
  domain: string
}

export default ((opts: Options) => {
  const VisitorCounter: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
    const slug = fileData.slug ?? ""
    const siteKey = encodeURIComponent(opts.domain)
    const pageKey = encodeURIComponent(`${opts.domain}/${slug}`)

    const totalBadge = `https://hits.sh/${siteKey}.svg?style=flat-square&label=Total%20Visits&color=284b63`
    const pageBadge = `https://hits.sh/${pageKey}.svg?style=flat-square&label=Page%20Views&color=84a59d`

    return (
      <div class={classNames(displayClass, "visitor-counter")}>
        <img src={totalBadge} alt="Total visits" loading="lazy" />
        <img src={pageBadge} alt="Page views" loading="lazy" />
      </div>
    )
  }

  VisitorCounter.css = `
.visitor-counter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1.5rem 0 0.5rem 0;
  align-items: center;
}

.visitor-counter img {
  height: 20px;
}
`

  return VisitorCounter
}) satisfies QuartzComponentConstructor<Options>
