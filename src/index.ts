/* eslint-disable no-console */
import {createStore} from 'tinybase/store';

const store = createStore().setTables({
  pets: {fido: {species: 'dog'}, felix: {species: 'cat'}},
});

console.log(store.getTables());
