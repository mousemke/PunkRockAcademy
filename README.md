# PunkRockAcademy
Get your fix. Discover other people's classics.

-
So.  This repo is dedicated to everyone's Punk Rock upbringings.  It will collect punk albums of all flavors that have influenced people's life with the stories to go with them.  If you would like to contribute, just ask to be a contributer or simply submit a pull request.

-
I have no idea where this is going, probably some frontend powered by node.js but i'm 100% open to other ideas/contributions.

-
**start the server with**
```
node server.js
```


-
**to import a JSON file into the library it should have following format:**

```
{
    "submitter":"your name",
    "albums":[
        {
            "band":"band name",
            "album":"album name",
            "art":"cover art",
            "links":[
                "https://rdio.com/etc",
                "https://www.youtube.com/etc",
                "https://spotify.com/etc"
            ],
            "stories":[
                {
                    "history":"This was my whatever"
                }
            ]
        },
        {
            "band":"another band name",
            "album":"another album name",
            "art":"cover art",
            "links":[
                "https://rdio.com/etc",
                "https://www.youtube.com/etc",
                "https://spotify.com/etc"
            ],
            "stories":[
                {
                    "history":"This was my whatever"
                }
            ]
        }
    ]
}
```

then just drop it in to the import folder before you run the server