---
title: Hello, world
description: A sample post that exercises every feature of the blog.
pubDate: 2026-10-23
tags: [meta, sample]
---

Welcome to the blog. This sample post exists so every feature can be tested:
search, comments and the contact form.

## Formatting

Some *emphasis*, some **strong text**, `inline code`, and a [link](https://astro.build).

> A blockquote, to check the styling.

- A bulleted list
- With a few items
  - And a nested one

1. A numbered list
2. With two items

## Code

```js
export function greet(name) {
  return `Hello, ${name}!`;
}
```

## An image

![Sample illustration](../../assets/sample.svg)

## A video

An embedded YouTube video, pasted as plain HTML. The `nocookie` domain avoids
tracking cookies until you press play.

<iframe width="560" height="315"
  src="https://www.youtube-nocookie.com/embed/jNQXAC9IVRw"
  title="Me at the zoo (the first YouTube video)"
  loading="lazy" allowfullscreen></iframe>

## A table

| Feature  | Stage |
| -------- | ----- |
| Search   | 2     |
| Comments | 3     |
| Admin    | 4     |

## Search keyword

The word *pineapple* appears only in this post, so searching for it should
return exactly one result once Pagefind is in place.
