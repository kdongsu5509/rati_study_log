import { QuartzEmitterPlugin } from "../types"
import { write } from "./helpers"
import { FullSlug } from "../../util/path"

export const RobotsTxt: QuartzEmitterPlugin = () => ({
  name: "RobotsTxt",
  async emit(ctx) {
    const baseUrl = ctx.cfg.configuration.baseUrl
    const sitemap = baseUrl
      ? `https://${baseUrl.replace(/\/$/, "")}/sitemap.xml`
      : "/sitemap.xml"

    const content = `User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`

    const path = await write({
      ctx,
      content,
      slug: "robots" as FullSlug,
      ext: ".txt",
    })
    return [path]
  },
  async *partialEmit() {},
})
