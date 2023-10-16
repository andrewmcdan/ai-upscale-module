// TODO: 
// 1. Add support for mac and linux
//   - d̶o̶w̶n̶l̶o̶a̶d̶ t̶h̶e̶ c̶o̶r̶r̶e̶c̶t̶ z̶i̶p̶ f̶i̶l̶e̶  (done, I think)
//   - figure out how to run the upscaler
// 2. Figure out a way to get the download progress

import fs from 'fs';
import AdmZip from 'adm-zip';
import fetch from 'node-fetch';
import { exec } from 'child_process';
import LargeDownload from 'large-download';
import { parse } from 'path';

const flags = {
    DOWNLOADING: "DOWNLOADING",
    DOWNLOADED: "DOWNLOADED",
    NOT_DOWNLOADED: "NOT_DOWNLOADED",
    READY: "READY",
    UNDEFINED: "UNDEFINED"
}

class Upscaler {
    constructor(options) {
        // first we check to see if the assests are downloded (upscaler and models). This sets the flags.
        // if they are not downloaded, we download them in the background
        if (options == undefined || options == null) {
            options = {};
        }
        if (options.defaultScale == undefined || options.defaultScale == null) {
            options.defaultScale = 4;
        }
        if (options.defaultFormat == undefined || options.defaultFormat == null) {
            options.defaultFormat = "jpg";
        } else if (options.defaultFormat !== "jpg" && options.defaultFormat !== "png") {
            options.defaultFormat = "jpg";
        }
        if (options.defaultOutputPath == undefined || options.defaultOutputPath == null) {
            options.defaultOutputPath = "./output/upscaled/";
        }
        if (options.downloadProgressCallback === undefined || options.downloadProgressCallback === null) {
            options.downloadProgressCallback = null;
        }

        this.options = options;
        this.downloadProgressCallback = options.downloadProgressCallback;
        this.upscaler = {};
        this.models = {};
        this.models.status = flags.UNDEFINED;
        this.upscaler.status = flags.UNDEFINED;
        // console.log('Checking for assets');
        this.status = "Checking for assets";
        this.checkForAssets();
        if (this.upscaler.status != flags.READY || this.models.status != flags.READY) {
            // console.log('Assets not found. Downloading assets');
            this.status = "Assets not found. Downloading assets";
            this.downloadAssets().then((success) => {
                //console.log('Assets downloaded');
                this.checkForAssets();
                this.status = "Assets downloaded, Upscaler ready";
            }).catch((error) => {
                // console.log('Error downloading assets');
                this.status = "Error downloading assets";
            });
        }
        if (this.upscaler.status == flags.READY && this.models.status == flags.READY) {
            this.status = "Upscaler ready";
        }
    }

    checkForAssets() {
        let upscalerFound = false;
        let upscalerPath = "";

        // find upscaler
        if (fs.existsSync('./unzipped')) {
            let unzippedFolder = fs.readdirSync('./unzipped');
            let latestVersion = {};
            latestVersion.versionNo = 0;
            latestVersion.folderName = "";
            if (unzippedFolder.length !== 0) {
                unzippedFolder.forEach((file, i) => {
                    let versionNo = file.substring(file.indexOf('kan-v') + 5, file.lastIndexOf("-"));
                    let versionNoArray = versionNo.split('.');
                    let versionNoInt = 0;
                    versionNoArray.forEach((version, index) => {
                        versionNoInt += parseInt(version) * Math.pow(10, index * 3);
                    });
                    if (versionNoInt > latestVersion.versionNo) {
                        latestVersion.versionNo = versionNoInt;
                        latestVersion.folderName = file;
                    }
                });
            }
            if (latestVersion.folderName !== "") {
                let dir = `./unzipped/${latestVersion.folderName}/`;
                let files = fs.readdirSync(dir);
                let exeFile = files.find(file => file.endsWith('.exe'));
                if (exeFile !== undefined) {
                    upscalerFound = true;
                    upscalerPath = dir + exeFile;
                }
            }
            if (upscalerFound) {
                this.upscaler.status = flags.READY;
                this.upscaler.path = upscalerPath;
            } else {
                this.upscaler.status = flags.NOT_DOWNLOADED;
                this.upscaler.path = "";
            }
        } else {
            this.upscaler.status = flags.NOT_DOWNLOADED;
            this.upscaler.path = "";
        }

        if (this.upscaler.status == flags.NOT_DOWNLOADED) {
            console.log('Upscaler is not installed. Will attempt to aquire in background.');
        }

        // find upscale model
        let modelsFound = false;
        let modelsFolder = "";
        // chekc to make sure model folder exists
        if (fs.existsSync('./models')) {
            let modelFolder = fs.readdirSync('./models');
            if (modelFolder.length !== 0) {
                modelFolder.forEach((file, i) => {
                    let folder1 = null;
                    try {
                        folder1 = fs.readdirSync('./models/' + file);
                    } catch (e) {
                        // do nothing
                    }
                    // check to see if "file" is a .param or .bin file
                    if (file.endsWith('.param') || file.endsWith('.bin')) {
                        modelsFound = true;
                        modelsFolder = './models/';
                    } else if (folder1 !== undefined) {
                        folder1.forEach((file2, i) => {
                            let folder2 = null;
                            try {
                                folder2 = fs.readdirSync('./models/' + file + '/' + file2);
                            } catch (e) {
                                // do nothing
                            }
                            // check to see if "file" is a .param or .bin file
                            if (file2.endsWith('.param') || file2.endsWith('.bin')) {
                                modelsFound = true;
                                modelsFolder = './models/' + file + '/';
                            } else if (folder2 !== undefined) {
                                folder2.forEach((file3, i) => {
                                    // check to see if "file" is a .param or .bin file
                                    if (file3.endsWith('.param') || file3.endsWith('.bin')) {
                                        modelsFound = true;
                                        modelsFolder = './models/' + file + '/' + file2 + '/';
                                    }
                                });
                            }
                        });
                    }
                });
            }
        }
        // console.log({ modelsFound });
        // console.log({ modelsFolder });

        if (modelsFound) {
            this.models.status = flags.READY;
            this.models.path = modelsFolder;
        } else {
            this.models.status = flags.NOT_DOWNLOADED;
            this.models.path = "";
            console.log('Models not found. Will attempt to aquire in background.');
        }
    }

    removeZipFolder() {
        // if zipped folder exists, remove it
        let success = false;
        try {
            if (fs.existsSync('./zipped')) {
                fs.rmSync('./zipped', { recursive: true });
            }
            // return true if successful or no zipped folder exists
            success = true;
        } catch (e) {
            console.error('Error removing zipped folder');
        }
        return success;
    }

    async downloadAssets() {
        return new Promise(async (resolve, reject) => {
            const owner = 'xinntao';
            const repo = 'Real-ESRGAN-ncnn-vulkan';
            let downloadSuceess = false;

            // create some folders
            try {
                // checked to see if zipped folder exists
                if (!fs.existsSync('./zipped')) {
                    fs.mkdirSync('./zipped');
                }
                // checked to see if unzipped folder exists
                if (!fs.existsSync('./unzipped')) {
                    fs.mkdirSync('./unzipped');
                }
            } catch (e) {
                console.error('Error creating folders');
                resolve(false);
            }

            // get platform name (windows, mac, linux) and set asset name
            let platform = process.platform;
            let assetName = "";
            if (platform === 'win32') assetName = 'windows.zip';
            else if (platform === 'darwin') assetName = 'macos.zip';
            else if (platform === 'linux') assetName = 'ubuntu.zip';
            else {
                console.error('Platform not supported');
                resolve(false);
            }

            // download windows upscaler
            this.upscaler.status = flags.DOWNLOADING;

            let tagName = await getLatestReleaseVersion(owner, repo);
            let dlLink = await getReleaseDownloadLink(owner, repo, tagName, assetName);
            let latestVersion = await getLatestReleaseVersion(owner, repo);

            this.downloadAndUnzip(dlLink, './zipped/realesrgan-ncnn-vulkan-' + latestVersion + '-' + assetName, 'unzipped/').then((success) => {
                if (success) this.upscaler.status = flags.DOWNLOADED;
                downloadSuceess = success;
            }).catch((error) => {
                resolve(false);
            }).finally(() => {
                if (this.models.status == flags.DOWNLOADED && this.upscaler.status == flags.DOWNLOADED) {
                    resolve(this.removeZipFolder());
                }
            });


            if (this.models.status != flags.READY && this.models.status != flags.DOWNLOADED) {
                this.models.status = flags.DOWNLOADING;
                this.downloadAndUnzip('https://github.com/upscayl/custom-models/archive/refs/heads/main.zip', './zipped/main.zip', 'unzipped/').then((success) => {
                    if (success) {
                        //move unzipped folder to models folder
                        try {
                            // make sure the root folder exists
                            if (!fs.existsSync('./models')) {
                                fs.mkdirSync('./models');
                            }
                            // copy files from unzipped folder to models folder
                            // find the folder name
                            let unzippedModelsFolder = fs.readdirSync('./unzipped/custom-models-main/models/');
                            // check to make sure /models/custom-models-main/models/ exists
                            if (!fs.existsSync('./models/custom-models-main/')) {
                                fs.mkdirSync('./models/custom-models-main/');
                            }
                            if (!fs.existsSync('./models/custom-models-main/models/')) {
                                fs.mkdirSync('./models/custom-models-main/models/');
                            }
                            // copy files
                            let destFolder = './models/custom-models-main/models/';
                            unzippedModelsFolder.forEach((file, i) => {
                                fs.copyFileSync('./unzipped/custom-models-main/models/' + file, destFolder + file);
                            });
                            // remove extraneous files
                            fs.rmSync('./unzipped/custom-models-main/', { recursive: true });
                            downloadSuceess = true;
                            this.models.status = flags.DOWNLOADED;
                        } catch (e) {
                            resolve(false);
                        }
                    } else {
                        resolve(false);
                    }
                }).catch((error) => {
                    resolve(false);
                }).finally(() => {
                    if (this.models.status == flags.DOWNLOADED && this.upscaler.status == flags.DOWNLOADED) {
                        resolve(this.removeZipFolder());
                    }
                });
            }
        });
    }

    setDownloadProgressCallback(callback) {
        this.downloadProgressCallback = callback;
    }

    async upscale(inputFile, outputPath = null, format = "", scale = -1) {
        if (outputPath == null) outputPath = this.options.defaultOutputPath;
        if (format == "") format = this.options.defaultFormat;
        if (scale == -1) scale = this.options.defaultScale;
        return new Promise(async (resolve, reject) => {
            if (this.upscaler.status != flags.READY || this.models.status != flags.READY) {
                console.error('Upscaler is not ready');
                resolve(false);
            }
            // check to see if inputFile exists
            if (!fs.existsSync(inputFile)) {
                console.error('File does not exist');
                resolve(false);
            }

            // check to see if inputFile is a valid image
            if (!inputFile.endsWith('.png')) {
                console.error('File is not a valid image');
                resolve(false);
            }

            let outputFile = inputFile.substring(inputFile.lastIndexOf('/') + 1, inputFile.lastIndexOf('.')) + '-upscaled.' + format;
            outputPath = outputPath.substring(0, outputPath.lastIndexOf('/')); // outputPath without file name
            await this.waitSeconds(2);
            try {
                if (!fs.existsSync(outputPath)) {
                    // create output path
                    fs.mkdirSync(outputPath);
                }
            } catch (e) {
                console.log(e);
                process.exit(1);
            }

            if (format !== "jpg" && format !== "png") {
                console.error('Format is not supported');
                resolve(false);
            }

            if (scale !== 2 && scale !== 3 && scale !== 4) {
                console.error('Scale is not supported');
                resolve(false);
            }

            // run upscaler
            // resolve absolute paths
            this.upscaler.path = fs.realpathSync(this.upscaler.path);
            inputFile = fs.realpathSync(inputFile);
            outputFile = fs.realpathSync(outputPath) + '\\\\' + outputFile;
            this.models.path = fs.realpathSync(this.models.path);
            let execString = this.upscaler.path;
            execString += " -i " + "\"" + inputFile + "\"";
            execString += " -o " + "\"" + outputFile + "\"";
            execString += " -f " + format;
            execString += " -s " + scale;
            execString += " -m " + "\"" + this.models.path + "\"";
            execString += " -n ultrasharp-2.0.1 ";
            let scaling = exec(execString, (err, stdout, stderr) => { });
            scaling.stderr.on('data', (data) => {
                // TODO: call progress callback
            });
            while (scaling.exitCode === null) {
                await this.waitSeconds(5);
            }
            if (scaling.exitCode == 0) {
                resolve(true);
            } else {
                resolve(false);
            }
        });
    }

    downloadAndUnzip = (url, zipPath, extractPath) => {
        return new Promise(async (resolve, reject) => {
            let waitingForFilename = true;
            fetch(url).then((response) => {
                const contentDisposition = response.headers.get("content-disposition");
                // console.log("contentDisposition: ", contentDisposition);
                if (contentDisposition) {
                    const match = /filename=([^;]+)/.exec(contentDisposition);
                    if (match) {
                        const filename = match[1];
                        // console.log("File name:", filename);
                    } else {
                        // console.log("No filename found in Content-Disposition header");
                    }
                } else {
                    // console.log("Content-Disposition header not found in the response");
                }
            }).catch((error) => {
                console.error("Error:", error);
            }).finally(() => { waitingForFilename = false; });

            while (waitingForFilename) { await this.waitSeconds(1); }

            try {
                let downloading = true;
                let downloadTotal = 0;

                const download = new LargeDownload({
                    link: url,
                    destination: zipPath,
                    timeout: 300000,
                    retries: 3,
                    onRetry: (error) => {
                        console.log("Download error. Retrying: ", { error }, { url }, { zipPath }, { extractPath });
                    },
                    onData: (downloaded, total) => {
                        // console.log( {downloaded}, {total});
                        downloadTotal = parseInt(total);
                        if(!isNaN(downloadTotal)) {
                            // convert to MB and truncate to 2 decimal places
                            downloadTotal = (downloadTotal / 1000000).toFixed(2);
                            downloaded = (downloaded / 1000000).toFixed(2);
                            console.log("Download progress: ", downloaded / downloadTotal);
                        }
                    },
                    minSizeToShowProgress: Infinity
                });

                download.load().then(() => {
                    downloading = false;
                    download.onRetry = null;
                }).catch(() => {
                    downloading = false;
                    download.onRetry = null;
                    reject(false);
                });

                while (downloading) {
                    await this.waitSeconds(0.5);
                    if (this.downloadProgressCallback !== null) this.downloadProgressCallback();
                }

                const zip = new AdmZip(zipPath);
                zip.extractAllTo(extractPath, true);
                resolve(true);
            } catch (error) {
                console.error("Error: ", { error });
                reject(false);
            }
        });
    };

    async waitSeconds(count) {
        // this holds the promise returned by the confirm function
        return await new Promise((resolve) => {
            setTimeout(() => {
                // if the user hasn't pressed enter to cancel, cancel the confirmation promise and resolve the wait promise with false
                resolve();
            }, count * 1000);
        });
    };
}

async function getLatestReleaseVersion(owner, repo) {
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
        const data = await response.json();
        return data.tag_name;
    } catch (error) {
        // console.error('Error:', error);
        return null;
    }
}

async function getReleaseDownloadLink(owner, repo, tagName, assetName) {
    try {
        // Get the release by tag name
        const releaseResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tagName}`);
        const releaseData = await releaseResponse.json();
        // console.log("////////////////////////////////////////////");
        // console.log(releaseData);
        // Find the asset with the given name
        let asset = false;
        releaseData.assets.forEach((a) => {
            // console.log(a.name);
            if (a.name.lastIndexOf(assetName) != -1) {
                // console.log("found");
                asset = a;
                // console.log(a.browser_download_url);
            }
        });

        if (asset) {
            // Return the download URL for the asset
            return asset.browser_download_url;
        } else {
            // console.log(`Asset "${assetName}" not found in the release.`);
            return null;
        }
    } catch (error) {
        return null;
    }
}

export default Upscaler;