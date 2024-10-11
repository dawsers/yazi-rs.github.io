"use strict";(self.webpackChunk=self.webpackChunk||[]).push([[31],{4108:e=>{e.exports=JSON.parse('{"archive":{"blogPosts":[{"id":"why-is-yazi-fast","metadata":{"permalink":"/blog/why-is-yazi-fast","editUrl":"https://github.com/yazi-rs/yazi-rs.github.io/edit/main/blog/2023-10-29-why-is-yazi-fast.md","source":"@site/blog/2023-10-29-why-is-yazi-fast.md","title":"Why is Yazi fast?","description":"This article assumes that you have already used Yazi and are familiar with most of its features.","date":"2023-10-29T00:00:00.000Z","tags":[],"readingTime":6.545,"hasTruncateMarker":false,"authors":[{"name":"\u4e09\u54b2\u96c5 \xb7 Misaki Masa","title":"Creator of Yazi","url":"https://github.com/sxyazi","imageURL":"https://github.com/sxyazi.png","key":"sxyazi","page":null}],"frontMatter":{"slug":"why-is-yazi-fast","title":"Why is Yazi fast?","authors":["sxyazi"]},"unlisted":false},"content":"This article assumes that you have already used Yazi and are familiar with most of its features.\\n\\nYazi has undergone significant optimizations to enhance user experience. It is designed entirely as an async program, handling all time-consuming tasks (I/O and CPU) as async tasks in a non-blocking, event-driven manner.\\n\\n## Tokio\\n\\nInternally, Yazi uses Tokio as its async runtime: hold on! Tokio\'s async may not be \\"truly async\\" as you might perceive it!\\n\\nUh, okay. From an application-layer perspective, it indeed is async; however, from a system-level view, there are possibly better solutions.\\n\\nBut! This is not the current performance bottleneck for Yazi. Considering Yazi is a TUI app, unlike CLI programs like `ls` and `eza` that need to output all files immediately, Yazi has more optimization opportunities at the application-layer:\\n\\n- For large directories (e.g., 100,000 files), Yazi uses [chunked loading](https://github.com/sxyazi/yazi/pull/117), which is unmatched by `ls` and `eza` since they must load everything at once.\\n- Yazi also preloads directory file lists in the background, an optimization that `ls` and `eza` do not possess.\\n\\nI must express my gratitude to Tokio for providing an excellent and convenient way to realize these application-layer optimizations.\\n\\nI believe that the benefits brought by these application-level optimizations are more noticeable compared to switching to solutions like `io_uring`. But I\'m open to this and welcome any constructive PR.\\n\\nHere is a relevant discussion on Reddit: https://www.reddit.com/r/rust/comments/16fxr58/comment/k066gmh/\\n\\n## Pre-Loading\\n\\nPreloaders are part of Yazi\'s concurrent plugin system, and the entire pre-loading process is asynchronous and spans multiple threads. This means that preloaders can handle not only expensive IO tasks but also CPU-bound tasks! Here are some built-in preloaders in Yazi:\\n\\n- Mimetype: The baseline. Yazi uses the file\'s mime-type as a reference for tasks such as opening, previewing, and style rendering, and internally utilizes `file(1)` to obtain the file\'s mime-type. For better performance, Yazi computes them for files of an entire page, rather than for each file individually, and the entire process is chunked to minimize response latency.\\n- Image: To accelerate image previews, Yazi uses a 2-pass process for image files. The first pass is preprocessing, which downscales the image based on user-set max_width/max_height and generates a compressed lossy image as a cache file, significantly reducing file size. The second pass occurs when the user actually switches to the file and downscales it again to fit the terminal size.\\n- Video: To speed up video previews, Yazi pre-converts them into images and goes through the first pass of image processing. When the user needs to display the video, it goes the same second pass.\\n- PDF: Similar to video.\\n- Directory size: Yazi lazily calculates the directory size only when the user sets sorting by file size, as it\'s a time-consuming operation.\\n\\nNote: Except for size, all of these are paged, meaning that when you are on the first page, only the first few files will be pre-loaded.\\n\\nFor example, if your directory has 1000 files, your terminal height is 10, and you are on the second page, only files 11 to 20 will be processed. This greatly saves resources.\\n\\n## Discardable Tasks\\n\\nEvery preview task is discardable. When you navigate between files quickly and the previous file\'s triggered preview task is still not finished, it will be discarded directly, initiating a new task. This promotes resource utilization:\\n\\n- For I/O tasks like loading directory lists, Tokio\'s `abort` is used;\\n- For CPU tasks like code highlighting, an `Atomic` is used to store a `ticket`, and it checks if the value changes on each line code highlight. If it changes, indicates that the current context has changed, and the entire highlighting task is discarded.\\n- For I/O and CPU tasks like previewer/preloader plugins, with Lua, Yazi can check whether these tasks are canceled when a specific number of CPU instructions. If canceled, it interrupts the execution of the Lua script immediately, avoiding wasting more I/O and CPU resources.\\n\\n## Code Highlighting\\n\\nYazi has built-in code highlighting and keeps it to a minimum for all text files: if your terminal height is 10, only the first 10 lines of the file are read and highlighted.\\n\\nOther file managers that rely on external programs like `bat` need to wait for `bat` to finish highlighting the _entire file_ before displaying only the first 10 lines.\\n\\nIn cases like JSON that require external program `jq`, Yazi kills `jq` directly after reading the first 10 lines to avoid unnecessary resource consumption.\\n\\nSince code highlighting is a CPU-bound task, it is distributed among multiple blocking threads, managed through Tokio\'s spawn_blocking, and is also discardable.\\n\\n## Image Preview\\n\\nYazi not only has built-in code highlighting but also includes image decoding and downscaling - there is likely nothing faster than having it directly built-in. It is also distributed among multiple threads and is discardable.\\n\\nBesides being fast, Yazi\'s built-in Kitty graphics protocol, Inline images protocol, and Sixel graphics format allow Yazi to finely control when to display or hide images.\\n\\nThis ensures that in Yazi, there won\'t be issues, like images stacking on top of each other, or image escape code breaking the entire screen, when navigating through images quickly, as `stdout` is locked while outputting these escape codes. This locking happens after all image data is prepared, so it has no impact on performance.\\n\\nYazi even supports partially erasing content in preview images, which is useful for pop-up components (Input, Select). The image won\'t overlap the input, and when the pop-up disappears, Yazi redraws the image to complete the erased portion automatically.\\n\\n## Async Task Scheduling\\n\\nIn Yazi, tasks are prioritized based on their severity automatically. Yazi categorizes tasks into two types:\\n\\n- Macro tasks: Large and heavy tasks, such as copying large files, typically taking a long time to complete.\\n- Micro tasks: Small and urgent tasks, such as fetching file mime-type, pre-loading images, calculating directory size, and so on.\\n\\nThis is similar to having big and small cores in a CPU; when the big cores are idle, they help with the micro tasks. Yazi defaults to starting 5 micro workers and 10 macro workers, and these numbers can be configured by the user!\\n\\nIn addition, Yazi introduces a priority scheduling mechanism. Each task has 3 priority levels: low, normal, and high. High-priority tasks can preempt low-priority tasks, applying to both micro and macro tasks. This increases task concurrency, slowing down HOL blocking caused by queuing execution of sudden requests.\\n\\nFor complex tasks like file copying, a combination of micro and macro approaches is employed. Micro is used to gather a list of all files to be copied recursively, allowing users to see the number of tasks and their sizes in advance. Macro, on the other hand, handles the actual copying process.\\n\\nThe advantage of task scheduling extends beyond providing ample concurrency for I/O and CPU resources; it also indirectly mitigates the depletion of system resources (such as file handles and CPU) due to sudden task surges.\\n\\n## Other optimizations\\n\\nThe above optimizations are the most noticeable to users, but behind the scenes, Yazi has also done many other optimizations. Include but are not limited to:\\n\\n- The re-implemented highly optimized natural sorting algorithm is [~6 times faster than the `natord`](https://github.com/sxyazi/yazi/pull/237) that `eza` uses in case-insensitive sorting.\\n- Yazi caches the directory state that has already been read, avoiding any unnecessary IO operations.\\n- When a file in a directory changes, it only updates the changed files rather than re-reading the entire directory list.\\n- Merges multiple renders triggered by multiple commands into a single render, avoiding unnecessary CPU consumption.\\n- Frequent updates to components, such as progress bars, are rendered independently, which is no cost compared to a complete render.\\n- The entire plugin system is designed with an asynchronous-first philosophy to avoid blocking the main thread with time-consuming tasks.\\n\\n## TODO\\n\\nI\'ll find time to continue writing."}]}}')}}]);