import * as fs from "fs";
import * as path from "path";

// Function to merge files from a directory
async function mergeFilesInDirectory(
  directoryPath: string,
  outputFile: string,
) {
  try {
    const files = await fs.promises.readdir(directoryPath);

    let mergedContent = "";

    for (const file of files) {
      const filePath = path.join(directoryPath, file);

      // Check if the item is a file (not a directory)
      const stat = await fs.promises.stat(filePath);
      if (stat.isFile()) {
        const fileContent = await fs.promises.readFile(filePath, "utf-8");
        mergedContent += `\n\n// File: ${file}\n\n` + fileContent;
      }
    }

    await fs.promises.writeFile(outputFile, mergedContent, "utf-8");
    console.log(`Merged files saved to ${outputFile}`);
  } catch (error) {
    console.error("Error merging files:", error);
  }
}

// Example usage
const directoryPath = "./tinyq"; // Path to the directory containing the files
const outputFile = "./merged-output.ts"; // Output file for the merged content

mergeFilesInDirectory(directoryPath, outputFile);
