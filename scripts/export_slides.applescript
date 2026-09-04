tell application "Keynote"
    set theFile to POSIX file "/Users/mostafakamal/Documents/Final Year Project/ Literature Review/LitSphere_Literature_Review_System_Presentation.pptx"
    set exportFolder to POSIX file "/Users/mostafakamal/Documents/Final Year Project/ Literature Review/slide_previews"
    set theDoc to open theFile
    export theDoc to exportFolder as slide images with properties {image format:PNG}
    close theDoc saving no
end tell
