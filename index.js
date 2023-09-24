import express from "express";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import dotenv from "dotenv";
import fs, { promises as fsPromises } from "fs";
import path from "path";
import WebTorrent from "webtorrent";
import { DownloaderHelper } from "node-downloader-helper";
import { download as HslDownload } from "node-hls-downloader";

dotenv.config();

const bot = new Telegraf(process.env.token);
const app = express();

// Set the bot API endpoint
app.use(await bot.createWebhook({ domain: process.env.webhookDomain }));

app.use(express.static("./test"));
app.use(express.static("./"));

async function setFile(data, filename) {
    await fsPromises.writeFile(filename, JSON.stringify(data));
}

async function getFile(filename) {
    const process = await fsPromises.readFile(filename);

    return JSON.parse(process.toString());
}

async function updateName(file_name) {
    const process = await getFile("./process.txt");
    await setFile({ ...process, file_name }, "./process.txt");
}

async function download(ctx) {
    const process = await getFile("./process.txt");
    let fileName = "";

    await ctx.reply("Downloading Video...");

    if (!fs.existsSync("./downloads")) {
        await fsPromises.mkdir("./downloads");
    }

    if (process.mode === "ddl") {
        const dl = new DownloaderHelper(process.url, "./downloads", {
            fileName: (a) => {
                fileName = `@AnimesGratuit_${
                    process.file_name ? process.file_name : a
                }`;
                return `@AnimesGratuit_${
                    process.file_name ? process.file_name : a
                }`;
            },
        });

        dl.on("end", () => {
            ctx.reply(`${process.env.base_url}/${fileName}`);
            console.log("Download Completed", fileName);
        });

        dl.on("error", (err) => console.log("Download Failed", err));

        dl.start().catch((err) => console.error(err));

        // dl.on("progress", (c) => {
        //     downloadedVid = c.progress;
        // });
    } else if (process.mode === "hls") {
        await HslDownload({
            quality: "best",
            concurrency: 5,
            outputFile: `downloads/@AnimesGratuit_${process.file_name}`,
            streamUrl: process.url,
        });

        await ctx.reply(
            `${process.env.base_url}/{@AnimesGratuit_${process.file_name}`
        );
    } else {
        const client = new WebTorrent();

        client.add(process.url, { path: "./downloads" }, (torrent) => {
            // torrent.on("download", function (bytes) {
            // });

            torrent.on("done", () => {
                ctx.reply(`${process.env.base_url}/${torrent.name}`);
                return;
            });
        });
    }

    await setFile({}, "./process.txt");
}

bot.start((ctx) => {
    ctx.reply(`Hello ${ctx.from.first_name}`, {
        reply_to_message_id: ctx.message.message_id,
    });
});

bot.command("files", async (ctx) => {
    const folderPath = "./downloads";

    if (!fs.existsSync("./downloads")) {
        await fsPromises.mkdir("./downloads");
    }

    try {
        const files = fs.readdirSync(folderPath);

        const filesData = files.map((file, index) => {
            const stats = fs.statSync(`./downloads/${file}`);
            const fileSizeInMB = Math.ceil(stats.size / 1048576);

            return [
                {
                    text: `${file.substring(0, 24)}... (${fileSizeInMB}MB)`,
                    callback_data: `file_${index}`,
                },
            ];
        });

        await ctx.reply(`Available Files: ${files.length}`, {
            reply_to_message_id: ctx.message.message_id,
            reply_markup: {
                inline_keyboard: filesData,
            },
        });
    } catch (error) {
        console.log(error);
        await ctx.reply(`Something went wrong`);
    }
});

bot.on(message("text"), async (ctx) => {
    const { text: msg } = ctx.message;

    if (msg.includes("http") || msg.includes("https")) {
        await ctx.reply(
            `Which method will you use to download the video at ${msg}`,
            {
                reply_to_message_id: ctx.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "DDL Downloader", callback_data: "ddl" }],
                        [{ text: "HLS Downloader", callback_data: "hls" }],
                        [
                            {
                                text: "Torrent Downloader",
                                callback_data: "torrent",
                            },
                        ],
                    ],
                },
            }
        );

        await fsPromises.writeFile(
            "./process.txt",
            JSON.stringify({
                url: msg,
            })
        );

        return;
    }

    const current_process = await getFile("./process.txt");

    if (current_process.mode) {
        console.log("in download loop");
        await setFile(
            {
                ...current_process,
                file_name: msg,
            },
            "./process.txt"
        );
        console.log("try");
        await download(ctx);
    }
});

bot.on("callback_query", async (ctx) => {
    const callback_data = ctx.callbackQuery.data;

    const current_process = await getFile("./process.txt");

    if (callback_data === "back") {
        const folderPath = "./downloads";

        try {
            const files = fs.readdirSync(folderPath);

            const filesData = files.map((file, index) => {
                const stats = fs.statSync(`./downloads/${file}`);
                const fileSizeInMB = Math.ceil(stats.size / 1048576);

                return [
                    {
                        text: `${file.substring(0, 24)}... (${fileSizeInMB}MB)`,
                        callback_data: `file_${index}`,
                    },
                ];
            });

            ctx.editMessageText(`Available Files: ${files.length}`, {
                reply_markup: {
                    inline_keyboard: filesData,
                },
            });
        } catch (error) {
            console.log(error);
            await ctx.reply(`Something went wrong`);
        }
        return;
    }

    if (callback_data.includes("gl")) {
        const id = parseInt(callback_data.match(/\d+/)[0]);
        const files = fs.readdirSync("./downloads");
        const file = files[id];
        ctx.reply(`${process.env.base_url}/${file}`);
        return;
    }

    if (callback_data.includes("df")) {
        const id = parseInt(callback_data.match(/\d+/)[0]);
        const files = fs.readdirSync("./downloads");
        const file = files[id];

        fs.unlink(`./downloads/${file}`, async (err) => {
            if (err) {
                console.error(err);
                return;
            }
            await ctx.answerCbQuery("File Deleted Sucessfully");
        });
        return;
    }

    if (callback_data.includes("file_")) {
        console.log("file");
        const id = parseInt(callback_data.match(/\d+/)[0]);

        const files = fs.readdirSync("./downloads");
        const file = files[id];
        const stats = fs.statSync(`./downloads/${file}`);
        const fileSizeInMB = Math.ceil(stats.size / 1048576);

        console.log(files[id]);

        ctx.editMessageText(
            `File name: ${file}\nFile size: ${fileSizeInMB}MB`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "Get Link", callback_data: "gl_" + id },
                            { text: "Delete File", callback_data: "df_" + id },
                        ],
                        [{ text: "Back", callback_data: "back" }],
                    ],
                },
            }
        );

        return;
    }

    if (callback_data === "default") {
        await download(ctx);
        return;
    }

    if (callback_data === "rename") {
        await ctx.reply("Enter new file name", {
            reply_markup: { force_reply: true },
        });

        return;
    }

    if (callback_data === "hls") {
        await setFile(
            {
                ...current_process,
                mode: "hls",
            },
            "./process.txt"
        );
    } else if (callback_data === "torrent") {
        await setFile(
            {
                ...current_process,
                mode: "torrent",
            },
            "./process.txt"
        );
    } else {
        await setFile(
            {
                ...current_process,
                mode: "ddl",
            },
            "./process.txt"
        );
    }

    const file_name = path.basename(current_process.url);

    await ctx.reply(`File Name: ${file_name}`, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "Default", callback_data: "default" },
                    { text: "Rename", callback_data: "rename" },
                ],
            ],
        },
    });
});

app.get("/", (req, res) => {
    res.send("Hello from express");
});

app.get("/", (req, res) => {
    res.send("Bot started");
});
