import { expect } from 'chai';

import type { CreateFromPermissionsRequestOverrides } from '../../src/interfaces/permissions-grant.js';
import type { PermissionScope } from '../../src/index.js';
import type { RecordsPermissionScope } from '../../src/types/permissions-grant-descriptor.js';

import { Message } from '../../src/core/message.js';
import { PermissionsConditionPublication } from '../../src/types/permissions-grant-descriptor.js';
import { PermissionsGrant } from '../../src/interfaces/permissions-grant.js';
import { Secp256k1 } from '../../src/utils/secp256k1.js';
import { TestDataGenerator } from '../utils/test-data-generator.js';
import { Time } from '../../src/utils/time.js';
import { DidKeyResolver, DwnErrorCode, DwnInterfaceName, DwnMethodName, Jws, PrivateKeySigner } from '../../src/index.js';

describe('PermissionsGrant', () => {
  describe('create()', async () => {
    it('creates a PermissionsGrant message', async () => {
      const { privateJwk } = await Secp256k1.generateKeyPair();
      const signer = new PrivateKeySigner({ privateJwk, keyId: 'did:jank:bob' });

      const { message } = await PermissionsGrant.create({
        dateExpires : Time.getCurrentTimestamp(),
        description : 'drugs',
        grantedBy   : 'did:jank:bob',
        grantedTo   : 'did:jank:alice',
        grantedFor  : 'did:jank:bob',
        scope       : { interface: DwnInterfaceName.Records, method: DwnMethodName.Write },
        signer
      });

      expect(message.descriptor.grantedTo).to.equal('did:jank:alice');
      expect(message.descriptor.grantedBy).to.equal('did:jank:bob');
      expect(message.descriptor.scope).to.eql({ interface: DwnInterfaceName.Records, method: DwnMethodName.Write });
      expect(message.descriptor.conditions).to.be.undefined;
      expect(message.descriptor.description).to.eql('drugs');
    });

    describe('scope property normalizations', async () => {
      it('ensures that `schema` is normalized', async () => {
        const { privateJwk } = await Secp256k1.generateKeyPair();
        const signer = new PrivateKeySigner({ privateJwk, keyId: 'did:jank:bob' });

        const scope: PermissionScope = {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Write,
          schema    : 'example.com/',
        };

        const { message } = await PermissionsGrant.create({
          dateExpires : Time.getCurrentTimestamp(),
          description : 'schema normalization test',
          grantedBy   : 'did:jank:bob',
          grantedTo   : 'did:jank:alice',
          grantedFor  : 'did:jank:bob',
          scope       : scope,
          signer
        });


        expect((message.descriptor.scope as RecordsPermissionScope).schema).to.equal('http://example.com');
      });

      it('ensures that `protocol` is normalized', async () => {
        const { privateJwk } = await Secp256k1.generateKeyPair();
        const signer = new PrivateKeySigner({ privateJwk, keyId: 'did:jank:bob' });

        const scope: PermissionScope = {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Write,
          protocol  : 'example.com/',
        };

        const { message } = await PermissionsGrant.create({
          dateExpires : Time.getCurrentTimestamp(),
          description : 'protocol normalization test',
          grantedBy   : 'did:jank:bob',
          grantedTo   : 'did:jank:alice',
          grantedFor  : 'did:jank:bob',
          scope       : scope,
          signer
        });


        expect((message.descriptor.scope as RecordsPermissionScope).protocol).to.equal('http://example.com');
      });
    });

    describe('scope validations', () => {
      it('ensures that `schema` and protocol related fields `protocol`, `contextId` or `protocolPath`', async () => {
        const { privateJwk } = await Secp256k1.generateKeyPair();
        const signer = new PrivateKeySigner({ privateJwk, keyId: 'did:jank:bob' });

        const permissionsGrantOptions = {
          dateExpires : Time.getCurrentTimestamp(),
          grantedBy   : 'did:jank:bob',
          grantedTo   : 'did:jank:alice',
          grantedFor  : 'did:jank:bob',
          signer
        };

        // Reject when `schema` and `protocol` are both present
        let scope: PermissionScope = {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Write,
          schema    : 'some-schema',
          protocol  : 'some-protocol'
        };
        expect(PermissionsGrant.create({ ...permissionsGrantOptions, scope }))
          .to.be.rejectedWith(DwnErrorCode.PermissionsGrantScopeSchemaProhibitedFields);

        // Reject when `schema` and `contextId` are both present
        scope = {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Write,
          schema    : 'some-schema',
          contextId : 'some-contextId'
        };
        expect(PermissionsGrant.create({ ...permissionsGrantOptions, scope }))
          .to.be.rejectedWith(DwnErrorCode.PermissionsGrantScopeSchemaProhibitedFields);

        // Reject when `schema` and `protocolPath` are both present
        scope = {
          interface    : DwnInterfaceName.Records,
          method       : DwnMethodName.Write,
          schema       : 'some-schema',
          protocolPath : 'some-protocol-path'
        };
        expect(PermissionsGrant.create({ ...permissionsGrantOptions, scope }))
          .to.be.rejectedWith(DwnErrorCode.PermissionsGrantScopeSchemaProhibitedFields);
      });

      it('ensures that `contextId` and `protocolPath` are not both present', async () => {
        const { privateJwk } = await Secp256k1.generateKeyPair();
        const signer = new PrivateKeySigner({ privateJwk, keyId: 'did:jank:bob' });

        const permissionsGrantOptions = {
          dateExpires : Time.getCurrentTimestamp(),
          grantedBy   : 'did:jank:bob',
          grantedTo   : 'did:jank:alice',
          grantedFor  : 'did:jank:bob',
          signer
        };

        // Allow when `context to be present ` and `protocol` are both present
        const scope = {
          interface    : DwnInterfaceName.Records,
          method       : DwnMethodName.Write,
          protocol     : 'some-protocol',
          contextId    : 'some-contextId',
          protocolPath : 'some-protocol-path',
        };
        expect(PermissionsGrant.create({ ...permissionsGrantOptions, scope }))
          .to.be.rejectedWith(DwnErrorCode.PermissionsGrantScopeContextIdAndProtocolPath);
      });
    });
  });

  describe('createFromPermissionsRequest()', async () => {
    it('should create a PermissionsGrant from a PermissionsRequest with the same properties', async () => {
      const alice = await TestDataGenerator.generatePersona();
      const bob = await TestDataGenerator.generatePersona();

      const { privateJwk } = await Secp256k1.generateKeyPair();
      const signer = new PrivateKeySigner({ privateJwk, keyId: alice.did });

      const { permissionsRequest } = await TestDataGenerator.generatePermissionsRequest({
        author      : bob,
        description : 'friendship',
        grantedBy   : alice.did,
        grantedFor  : alice.did,
        grantedTo   : bob.did,
      });

      const dateExpires = Time.createOffsetTimestamp({ seconds: 60 * 60 * 24 });
      const permissionsGrant = await PermissionsGrant.createFromPermissionsRequest(permissionsRequest, signer, { dateExpires });

      expect(permissionsGrant.author).to.eq(alice.did);
      expect(permissionsGrant.message.descriptor.description).to.eq(permissionsRequest.message.descriptor.description);
      expect(permissionsGrant.message.descriptor.grantedBy).to.eq(permissionsRequest.message.descriptor.grantedBy);
      expect(permissionsGrant.message.descriptor.grantedTo).to.eq(permissionsRequest.message.descriptor.grantedTo);
      expect(permissionsGrant.message.descriptor.grantedFor).to.eq(permissionsRequest.message.descriptor.grantedFor);
      expect(permissionsGrant.message.descriptor.scope).to.eql(permissionsRequest.message.descriptor.scope);
      expect(permissionsGrant.message.descriptor.conditions).to.eq(permissionsRequest.message.descriptor.conditions);
      expect(permissionsGrant.message.descriptor.permissionsRequestId).to.eq(await Message.getCid(permissionsRequest.message));
    });

    it('should create a PermissionsGrant from a PermissionsRequest and overrides', async () => {
      const alice = await DidKeyResolver.generate();
      const bob = await DidKeyResolver.generate();
      const carol = await DidKeyResolver.generate();

      const { privateJwk } = await Secp256k1.generateKeyPair();
      const signer = new PrivateKeySigner({ privateJwk, keyId: `${alice.did}#key1` });

      const { permissionsRequest } = await TestDataGenerator.generatePermissionsRequest();

      const description = 'friendship';
      const dateExpires = Time.getCurrentTimestamp();
      const overrides: CreateFromPermissionsRequestOverrides = {
        dateExpires,
        description,
        grantedBy  : alice.did,
        grantedTo  : bob.did,
        grantedFor : carol.did,
        scope      : {
          interface : DwnInterfaceName.Protocols,
          method    : DwnMethodName.Query,
        },
        conditions: {
          publication: PermissionsConditionPublication.Required,
        }
      };

      const permissionsGrant = await PermissionsGrant.createFromPermissionsRequest(permissionsRequest, signer, overrides);

      expect(permissionsGrant.author).to.eq(alice.did);
      expect(permissionsGrant.message.descriptor.description).to.eq(description);
      expect(permissionsGrant.message.descriptor.grantedBy).to.eq(overrides.grantedBy);
      expect(permissionsGrant.message.descriptor.grantedTo).to.eq(overrides.grantedTo);
      expect(permissionsGrant.message.descriptor.grantedFor).to.eq(overrides.grantedFor);
      expect(permissionsGrant.message.descriptor.scope).to.eql(overrides.scope);
      expect(permissionsGrant.message.descriptor.conditions).to.eq(overrides.conditions);
      expect(permissionsGrant.message.descriptor.permissionsRequestId).to.eq(await Message.getCid(permissionsRequest.message));
    });
  });

  describe('asDelegatedGrant()', async () => {
    it('should throw if the `delegated` property is not `true`', async () => {
      const alice = await TestDataGenerator.generatePersona();

      const { message } = await PermissionsGrant.create({
        dateExpires : Time.getCurrentTimestamp(),
        grantedBy   : alice.did,
        grantedTo   : 'did:example:bob',
        grantedFor  : alice.did,
        scope       : { interface: DwnInterfaceName.Records, method: DwnMethodName.Write },
        signer      : Jws.createSigner(alice)
      });

      expect(() => PermissionsGrant.asDelegatedGrant(message)).to.throw(DwnErrorCode.PermissionsGrantNotADelegatedGrant);
    });
  });
});
