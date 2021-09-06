
# Mocked Server

## Future
- fail on unknown requests (breaking change)
- get rid of handle and handleNext methods on MockedServer (breaking changes)
- add documentation with examples (basic usage, matchers, promises)
- prevent to call handleNext handler multiple-times with delayed processing of matcher

## Done
- matchers
- use .verb() as .route()
- checker returned from handleNext is thenable
