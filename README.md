# PunkRockAcademy
Get your fix. Discover other people's classics.

-
This repo is dedicated to everyone's Punk Rock upbringings.  It will collect punk albums of all flavors that have influenced people's life with the stories to go with them.  To contribute your 10 most influencial albums, go to http://punk.knoblau.ch/submit. If you would like contribute to the code itself, just ask to be a contributer or simply submit a pull request.

-
live routes include (but as of now are mostly placeholders):

+ home
```
/
```

+ submit music
```
/submit
```

+ description of the 10 influences project
```
/10
```

+ see someone's 10 influences
```
/10/{any submitters name}
```

+ see someone's 10 influences (json)
```
/10/{any submitters name}/json
```

+ retrieve full library (json)
```
/?lib
```

+ retrieve library sorted by album (json)
```
/?album
```


+ retrieve library sorted by artist (json)
```
/?artist
```


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