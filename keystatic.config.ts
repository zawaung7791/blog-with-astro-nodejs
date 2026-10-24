import { collection, config, fields } from '@keystatic/core';

// Dev-only editor: only loaded by `npm run dev` (see astro.config.mjs) and
// writes straight to src/content/posts. It is not part of the production build.
export default config({
  storage: { kind: 'local' },
  collections: {
    posts: collection({
      label: 'Posts',
      slugField: 'title',
      path: 'src/content/posts/*',
      format: { contentField: 'content' },
      entryLayout: 'content',
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        description: fields.text({ label: 'Description', validation: { isRequired: true } }),
        pubDate: fields.date({ label: 'Publish date', validation: { isRequired: true } }),
        updatedDate: fields.date({ label: 'Updated date' }),
        tags: fields.array(fields.text({ label: 'Tag' }), {
          label: 'Tags',
          itemLabel: (props) => props.value,
        }),
        draft: fields.checkbox({ label: 'Draft', defaultValue: false }),
        content: fields.markdoc({
          label: 'Content',
          extension: 'md',
          // Images go to src/assets/posts so Astro can resolve and optimise
          // them; the path is written relative to the post file.
          options: { image: { directory: 'src/assets/posts', publicPath: '../../assets/posts/' } },
        }),
      },
    }),
  },
});
