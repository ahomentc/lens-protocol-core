import { BigNumber } from '@ethersproject/contracts/node_modules/@ethersproject/bignumber';
import { parseEther } from '@ethersproject/units';
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import '@nomiclabs/hardhat-ethers';
import { expect } from 'chai';
import { MAX_UINT256, ZERO_ADDRESS } from '../../helpers/constants';
import { ERRORS } from '../../helpers/errors';
import { getTimestamp, matchEvent, setNextBlockTimestamp, waitForTx } from '../../helpers/utils';
import {
  abiCoder,
  BPS_MAX,
  currency,
  FIRST_PROFILE_ID,
  governance,
  lensHub,
  makeSuiteCleanRoom,
  MOCK_FOLLOW_NFT_URI,
  MOCK_PROFILE_HANDLE,
  MOCK_PROFILE_URI,
  MOCK_URI,
  moduleGlobals,
  REFERRAL_FEE_BPS,
  whitelistedTimedFeeCollectModule,
  treasuryAddress,
  TREASURY_FEE_BPS,
  userAddress,
  userTwo,
  userTwoAddress,
} from '../../__setup.spec';

makeSuiteCleanRoom('Whitelisted Timed Fee Collect Module', function () {
  const DEFAULT_COLLECT_PRICE = parseEther('10');

  beforeEach(async function () {
    await expect(
      lensHub.createProfile({
        to: userAddress,
        handle: MOCK_PROFILE_HANDLE,
        imageURI: MOCK_PROFILE_URI,
        followModule: ZERO_ADDRESS,
        followModuleInitData: [],
        followNFTURI: MOCK_FOLLOW_NFT_URI,
      })
    ).to.not.be.reverted;
    await expect(
      lensHub.connect(governance).whitelistCollectModule(whitelistedTimedFeeCollectModule.address, true)
    ).to.not.be.reverted;
    await expect(
      moduleGlobals.connect(governance).whitelistCurrency(currency.address, true)
    ).to.not.be.reverted;
  });

  context('Negatives', function () {
    context('Publication Creation', function () {
      it('user should fail to post with timed fee collect module using unwhitelisted currency', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const merkleRoot = merkleTree.getHexRoot();

        const collectModuleInitData = abiCoder.encode(
          ['uint256', 'address', 'address', 'uint16', 'bool', 'bytes32'],
          [DEFAULT_COLLECT_PRICE, userTwoAddress, userAddress, REFERRAL_FEE_BPS, true, merkleRoot]
        );
        await expect(
          lensHub.post({
            profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: whitelistedTimedFeeCollectModule.address,
            collectModuleInitData: collectModuleInitData,
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.be.revertedWith(ERRORS.INIT_PARAMS_INVALID);
      });

      it('user should fail to post with timed fee collect module using zero recipient', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const merkleRoot = merkleTree.getHexRoot();

        const collectModuleInitData = abiCoder.encode(
          ['uint256', 'address', 'address', 'uint16', 'bool', 'bytes32'],
          [DEFAULT_COLLECT_PRICE, currency.address, ZERO_ADDRESS, REFERRAL_FEE_BPS, true, merkleRoot]
        );
        await expect(
          lensHub.post({
            profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: whitelistedTimedFeeCollectModule.address,
            collectModuleInitData: collectModuleInitData,
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.be.revertedWith(ERRORS.INIT_PARAMS_INVALID);
      });

      it('user should fail to post with timed fee collect module using referral fee greater than max BPS', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const merkleRoot = merkleTree.getHexRoot();

        const collectModuleInitData = abiCoder.encode(
          ['uint256', 'address', 'address', 'uint16', 'bool', 'bytes32'],
          [DEFAULT_COLLECT_PRICE, currency.address, userAddress, 10001, true, merkleRoot]
        );
        await expect(
          lensHub.post({
            profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: whitelistedTimedFeeCollectModule.address,
            collectModuleInitData: collectModuleInitData,
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.be.revertedWith(ERRORS.INIT_PARAMS_INVALID);
      });

      it('user should fail to post with timed fee collect module using zero amount', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const merkleRoot = merkleTree.getHexRoot();

        const collectModuleInitData = abiCoder.encode(
          ['uint256', 'address', 'address', 'uint16', 'bool', 'bytes32'],
          [0, currency.address, userAddress, REFERRAL_FEE_BPS, true, merkleRoot]
        );
        await expect(
          lensHub.post({
            profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: whitelistedTimedFeeCollectModule.address,
            collectModuleInitData: collectModuleInitData,
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.be.revertedWith(ERRORS.INIT_PARAMS_INVALID);
      });
    });

    context('Collecting', function () {
      beforeEach(async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const merkleRoot = merkleTree.getHexRoot();

        const collectModuleInitData = abiCoder.encode(
          ['uint256', 'address', 'address', 'uint16', 'bool', 'bytes32'],
          [DEFAULT_COLLECT_PRICE, currency.address, userAddress, REFERRAL_FEE_BPS, true, merkleRoot]
        );
        await expect(
          lensHub.post({
            profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: whitelistedTimedFeeCollectModule.address,
            collectModuleInitData: collectModuleInitData,
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
      });

      it('UserTwo should fail to process collect without being the hub', async function () {
        await expect(
          whitelistedTimedFeeCollectModule
            .connect(userTwo)
            .processCollect(0, userTwoAddress, FIRST_PROFILE_ID, 1, [])
        ).to.be.revertedWith(ERRORS.NOT_HUB);
      });

      it('Governance should set the treasury fee BPS to zero, userTwo collecting should not emit a transfer event to the treasury', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
        await expect(moduleGlobals.connect(governance).setTreasuryFee(0)).to.not.be.reverted;
        var data = abiCoder.encode(
          ['address', 'uint256'],
          [currency.address, DEFAULT_COLLECT_PRICE]
        );
        const encodedProof = abiCoder.encode(
          ['bytes32[]'],
          [proof]
        ).slice(2)
        data = data + encodedProof
        await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

        await expect(currency.mint(userTwoAddress, MAX_UINT256)).to.not.be.reverted;
        await expect(
          currency.connect(userTwo).approve(whitelistedTimedFeeCollectModule.address, MAX_UINT256)
        ).to.not.be.reverted;

        const tx = lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data);
        const receipt = await waitForTx(tx);

        let currencyEventCount = 0;
        for (let log of receipt.logs) {
          if (log.address == currency.address) {
            currencyEventCount++;
          }
        }
        expect(currencyEventCount).to.eq(1);
        matchEvent(
          receipt,
          'Transfer',
          [userTwoAddress, userAddress, DEFAULT_COLLECT_PRICE],
          currency,
          currency.address
        );
      });

      it('UserTwo should mirror the original post, governance should set the treasury fee BPS to zero, userTwo collecting their mirror should not emit a transfer event to the treasury', async function () {
        const secondProfileId = FIRST_PROFILE_ID + 1;
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
        await expect(
          lensHub.connect(userTwo).createProfile({
            to: userTwoAddress,
            handle: 'usertwo',
            imageURI: MOCK_PROFILE_URI,
            followModule: ZERO_ADDRESS,
            followModuleInitData: [],
            followNFTURI: MOCK_FOLLOW_NFT_URI,
          })
        ).to.not.be.reverted;
        await expect(
          lensHub.connect(userTwo).mirror({
            profileId: secondProfileId,
            profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;

        await expect(moduleGlobals.connect(governance).setTreasuryFee(0)).to.not.be.reverted;
        var data = abiCoder.encode(
          ['address', 'uint256'],
          [currency.address, DEFAULT_COLLECT_PRICE]
        );
        const encodedProof = abiCoder.encode(
          ['bytes32[]'],
          [proof]
        ).slice(2)
        data = data + encodedProof
        await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

        await expect(currency.mint(userTwoAddress, MAX_UINT256)).to.not.be.reverted;
        await expect(
          currency.connect(userTwo).approve(whitelistedTimedFeeCollectModule.address, MAX_UINT256)
        ).to.not.be.reverted;

        const tx = lensHub.connect(userTwo).collect(secondProfileId, 1, data);
        const receipt = await waitForTx(tx);

        let currencyEventCount = 0;
        for (let log of receipt.logs) {
          if (log.address == currency.address) {
            currencyEventCount++;
          }
        }
        expect(currencyEventCount).to.eq(2);

        const expectedReferralAmount = BigNumber.from(DEFAULT_COLLECT_PRICE)
          .mul(REFERRAL_FEE_BPS)
          .div(BPS_MAX);
        const amount = DEFAULT_COLLECT_PRICE.sub(expectedReferralAmount);

        matchEvent(
          receipt,
          'Transfer',
          [userTwoAddress, userAddress, amount],
          currency,
          currency.address
        );

        matchEvent(
          receipt,
          'Transfer',
          [userTwoAddress, userTwoAddress, expectedReferralAmount],
          currency,
          currency.address
        );
      });

      it('UserTwo should fail to collect without following', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
        var data = abiCoder.encode(
          ['address', 'uint256'],
          [currency.address, DEFAULT_COLLECT_PRICE]
        );
        const encodedProof = abiCoder.encode(
          ['bytes32[]'],
          [proof]
        ).slice(2)
        data = data + encodedProof
        await expect(
          lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)
        ).to.be.revertedWith(ERRORS.FOLLOW_INVALID);
      });

      it('UserTwo should fail to collect after the collect end timestmap', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
        await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

        const currentTimestamp = await getTimestamp();
        await setNextBlockTimestamp(Number(currentTimestamp) + 24 * 60 * 60);

        var data = abiCoder.encode(
          ['address', 'uint256'],
          [currency.address, DEFAULT_COLLECT_PRICE]
        );
        const encodedProof = abiCoder.encode(
          ['bytes32[]'],
          [proof]
        ).slice(2)
        data = data + encodedProof
        await expect(
          lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)
        ).to.be.revertedWith(ERRORS.COLLECT_EXPIRED);
      });

      it('UserTwo should fail to collect passing a different expected price in data', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
        await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

        var data = abiCoder.encode(
          ['address', 'uint256'],
          [currency.address, DEFAULT_COLLECT_PRICE.div(2)]
        );
        const encodedProof = abiCoder.encode(
          ['bytes32[]'],
          [proof]
        ).slice(2)
        data = data + encodedProof
        await expect(
          lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)
        ).to.be.revertedWith(ERRORS.MODULE_DATA_MISMATCH);
      });

      it('UserTwo should fail to collect passing a different expected currency in data', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
        await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

        var data = abiCoder.encode(['address', 'uint256'], [userAddress, DEFAULT_COLLECT_PRICE]);
        const encodedProof = abiCoder.encode(
          ['bytes32[]'],
          [proof]
        ).slice(2)
        data = data + encodedProof
        await expect(
          lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)
        ).to.be.revertedWith(ERRORS.MODULE_DATA_MISMATCH);
      });

      it('UserTwo should fail to collect without first approving module with currency', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
        await expect(currency.mint(userTwoAddress, MAX_UINT256)).to.not.be.reverted;

        await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

        var data = abiCoder.encode(
          ['address', 'uint256'],
          [currency.address, DEFAULT_COLLECT_PRICE]
        );
        const encodedProof = abiCoder.encode(
          ['bytes32[]'],
          [proof]
        ).slice(2)
        data = data + encodedProof
        await expect(
          lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)
        ).to.be.revertedWith(ERRORS.ERC20_INSUFFICIENT_ALLOWANCE);
      });

      it('UserTwo should mirror the original post, fail to collect from their mirror without following the original profile', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
        const secondProfileId = FIRST_PROFILE_ID + 1;
        await expect(
          lensHub.connect(userTwo).createProfile({
            to: userTwoAddress,
            handle: 'usertwo',
            imageURI: MOCK_PROFILE_URI,
            followModule: ZERO_ADDRESS,
            followModuleInitData: [],
            followNFTURI: MOCK_FOLLOW_NFT_URI,
          })
        ).to.not.be.reverted;
        await expect(
          lensHub.connect(userTwo).mirror({
            profileId: secondProfileId,
            profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;

        var data = abiCoder.encode(
          ['address', 'uint256'],
          [currency.address, DEFAULT_COLLECT_PRICE]
        );
        const encodedProof = abiCoder.encode(
          ['bytes32[]'],
          [proof]
        ).slice(2)
        data = data + encodedProof
        await expect(lensHub.connect(userTwo).collect(secondProfileId, 1, data)).to.be.revertedWith(
          ERRORS.FOLLOW_INVALID
        );
      });

      it('UserTwo should mirror the original post, fail to collect from their mirror after the collect end timestamp', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
        const secondProfileId = FIRST_PROFILE_ID + 1;
        await expect(
          lensHub.connect(userTwo).createProfile({
            to: userTwoAddress,
            handle: 'usertwo',
            imageURI: MOCK_PROFILE_URI,
            followModule: ZERO_ADDRESS,
            followModuleInitData: [],
            followNFTURI: MOCK_FOLLOW_NFT_URI,
          })
        ).to.not.be.reverted;
        await expect(
          lensHub.connect(userTwo).mirror({
            profileId: secondProfileId,
            profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;

        await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

        const currentTimestamp = await getTimestamp();
        await setNextBlockTimestamp(Number(currentTimestamp) + 24 * 60 * 60);

        var data = abiCoder.encode(
          ['address', 'uint256'],
          [currency.address, DEFAULT_COLLECT_PRICE]
        );
        const encodedProof = abiCoder.encode(
          ['bytes32[]'],
          [proof]
        ).slice(2)
        data = data + encodedProof
        await expect(lensHub.connect(userTwo).collect(secondProfileId, 1, data)).to.be.revertedWith(
          ERRORS.COLLECT_EXPIRED
        );
      });

      it('UserTwo should mirror the original post, fail to collect from their mirror passing a different expected price in data', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
        const secondProfileId = FIRST_PROFILE_ID + 1;
        await expect(
          lensHub.connect(userTwo).createProfile({
            to: userTwoAddress,
            handle: 'usertwo',
            imageURI: MOCK_PROFILE_URI,
            followModule: ZERO_ADDRESS,
            followModuleInitData: [],
            followNFTURI: MOCK_FOLLOW_NFT_URI,
          })
        ).to.not.be.reverted;
        await expect(
          lensHub.connect(userTwo).mirror({
            profileId: secondProfileId,
            profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;

        await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

        var data = abiCoder.encode(
          ['address', 'uint256'],
          [currency.address, DEFAULT_COLLECT_PRICE.div(2)]
        );
        const encodedProof = abiCoder.encode(
          ['bytes32[]'],
          [proof]
        ).slice(2)
        data = data + encodedProof
        await expect(lensHub.connect(userTwo).collect(secondProfileId, 1, data)).to.be.revertedWith(
          ERRORS.MODULE_DATA_MISMATCH
        );
      });

      it('UserTwo should mirror the original post, fail to collect from their mirror passing a different expected currency in data', async function () {
        const whitelisted = [userAddress, userTwoAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
        const secondProfileId = FIRST_PROFILE_ID + 1;
        await expect(
          lensHub.connect(userTwo).createProfile({
            to: userTwoAddress,
            handle: 'usertwo',
            imageURI: MOCK_PROFILE_URI,
            followModule: ZERO_ADDRESS,
            followModuleInitData: [],
            followNFTURI: MOCK_FOLLOW_NFT_URI,
          })
        ).to.not.be.reverted;
        await expect(
          lensHub.connect(userTwo).mirror({
            profileId: secondProfileId,
            profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;

        await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

        var data = abiCoder.encode(['address', 'uint256'], [userAddress, DEFAULT_COLLECT_PRICE]);
        const encodedProof = abiCoder.encode(
          ['bytes32[]'],
          [proof]
        ).slice(2)
        data = data + encodedProof
        await expect(lensHub.connect(userTwo).collect(secondProfileId, 1, data)).to.be.revertedWith(
          ERRORS.MODULE_DATA_MISMATCH
        );
      });

      it('UserTwo should fail to collect if they are not whitelisted', async function () {
        const whitelisted = [userAddress]
        const leafNodes = whitelisted.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
        var data = abiCoder.encode(
          ['address', 'uint256'],
          [currency.address, DEFAULT_COLLECT_PRICE]
        );
        const encodedProof = abiCoder.encode(
          ['bytes32[]'],
          [proof]
        ).slice(2)
        data = data + encodedProof
        await expect(
          lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)
        ).to.be.revertedWith(ERRORS.FOLLOW_INVALID);
      });
    });
  });

  context('Scenarios', function () {
    it('User should post with timed fee collect module as the collect module and data, correct events should be emitted', async function () {
      const whitelisted = [userAddress]
      const leafNodes = whitelisted.map(addr => keccak256(addr));
      const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
      const merkleRoot = merkleTree.getHexRoot();
      const collectModuleInitData = abiCoder.encode(
        ['uint256', 'address', 'address', 'uint16', 'bool', 'bytes32'],
        [DEFAULT_COLLECT_PRICE, currency.address, userAddress, REFERRAL_FEE_BPS, true, merkleRoot]
      );

      const tx = lensHub.post({
        profileId: FIRST_PROFILE_ID,
        contentURI: MOCK_URI,
        collectModule: whitelistedTimedFeeCollectModule.address,
        collectModuleInitData: collectModuleInitData,
        referenceModule: ZERO_ADDRESS,
        referenceModuleInitData: [],
      });

      const receipt = await waitForTx(tx);

      const postTimestamp = await getTimestamp();
      const endTimestamp = BigNumber.from(postTimestamp).add(24 * 60 * 60);
      const expectedData = abiCoder.encode(
        ['uint256', 'address', 'address', 'uint16', 'bool', 'uint40', 'bytes32'],
        [DEFAULT_COLLECT_PRICE, currency.address, userAddress, REFERRAL_FEE_BPS, true, endTimestamp, merkleRoot]
      );

      expect(receipt.logs.length).to.eq(1);
      matchEvent(receipt, 'PostCreated', [
        FIRST_PROFILE_ID,
        1,
        MOCK_URI,
        whitelistedTimedFeeCollectModule.address,
        expectedData,
        ZERO_ADDRESS,
        [],
        await getTimestamp(),
      ]);
    });

    it('User should post with timed fee collect module as the collect module and data, fetched publication data should be accurate', async function () {
      const whitelisted = [userAddress]
      const leafNodes = whitelisted.map(addr => keccak256(addr));
      const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
      const merkleRoot = merkleTree.getHexRoot();
      const collectModuleInitData = abiCoder.encode(
        ['uint256', 'address', 'address', 'uint16', 'bool', 'bytes32'],
        [DEFAULT_COLLECT_PRICE, currency.address, userAddress, REFERRAL_FEE_BPS, true, merkleRoot]
      );
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: whitelistedTimedFeeCollectModule.address,
          collectModuleInitData: collectModuleInitData,
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;
      const postTimestamp = await getTimestamp();

      const fetchedData = await whitelistedTimedFeeCollectModule.getPublicationData(FIRST_PROFILE_ID, 1);
      expect(fetchedData.amount).to.eq(DEFAULT_COLLECT_PRICE);
      expect(fetchedData.recipient).to.eq(userAddress);
      expect(fetchedData.currency).to.eq(currency.address);
      expect(fetchedData.referralFee).to.eq(REFERRAL_FEE_BPS);
      expect(fetchedData.followerOnly).to.eq(true);
      expect(fetchedData.endTimestamp).to.eq(BigNumber.from(postTimestamp).add(24 * 60 * 60));
      expect(fetchedData.merkleRoot).to.eq(merkleRoot);
    });

    it('User should post with timed fee collect module as the collect module and data, allowing non-followers to collect, user two collects without following, fee distribution is valid', async function () {
      const whitelisted = [userAddress, userTwoAddress]
      const leafNodes = whitelisted.map(addr => keccak256(addr));
      const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
      const merkleRoot = merkleTree.getHexRoot();
      const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
      const collectModuleInitData = abiCoder.encode(
        ['uint256', 'address', 'address', 'uint16', 'bool', 'bytes32'],
        [DEFAULT_COLLECT_PRICE, currency.address, userAddress, REFERRAL_FEE_BPS, false, merkleRoot]
      );
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: whitelistedTimedFeeCollectModule.address,
          collectModuleInitData: collectModuleInitData,
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(currency.mint(userTwoAddress, MAX_UINT256)).to.not.be.reverted;
      await expect(
        currency.connect(userTwo).approve(whitelistedTimedFeeCollectModule.address, MAX_UINT256)
      ).to.not.be.reverted;
      var data = abiCoder.encode(
        ['address', 'uint256'],
        [currency.address, DEFAULT_COLLECT_PRICE]
      );
      const encodedProof = abiCoder.encode(
        ['bytes32[]'],
        [proof]
      ).slice(2)
      data = data + encodedProof
      await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.not.be.reverted;

      const expectedTreasuryAmount = BigNumber.from(DEFAULT_COLLECT_PRICE)
        .mul(TREASURY_FEE_BPS)
        .div(BPS_MAX);
      const expectedRecipientAmount =
        BigNumber.from(DEFAULT_COLLECT_PRICE).sub(expectedTreasuryAmount);

      expect(await currency.balanceOf(userTwoAddress)).to.eq(
        BigNumber.from(MAX_UINT256).sub(DEFAULT_COLLECT_PRICE)
      );
      expect(await currency.balanceOf(userAddress)).to.eq(expectedRecipientAmount);
      expect(await currency.balanceOf(treasuryAddress)).to.eq(expectedTreasuryAmount);
    });

    it('User should post with timed fee collect module as the collect module and data, user two follows, then collects and pays fee, fee distribution is valid', async function () {
      const whitelisted = [userAddress, userTwoAddress]
      const leafNodes = whitelisted.map(addr => keccak256(addr));
      const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
      const merkleRoot = merkleTree.getHexRoot();
      const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
      const collectModuleInitData = abiCoder.encode(
        ['uint256', 'address', 'address', 'uint16', 'bool', 'bytes32'],
        [DEFAULT_COLLECT_PRICE, currency.address, userAddress, REFERRAL_FEE_BPS, true, merkleRoot]
      );
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: whitelistedTimedFeeCollectModule.address,
          collectModuleInitData: collectModuleInitData,
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(currency.mint(userTwoAddress, MAX_UINT256)).to.not.be.reverted;
      await expect(
        currency.connect(userTwo).approve(whitelistedTimedFeeCollectModule.address, MAX_UINT256)
      ).to.not.be.reverted;
      await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
      var data = abiCoder.encode(
        ['address', 'uint256'],
        [currency.address, DEFAULT_COLLECT_PRICE]
      );
      const encodedProof = abiCoder.encode(
        ['bytes32[]'],
        [proof]
      ).slice(2)
      data = data + encodedProof
      await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.not.be.reverted;

      const expectedTreasuryAmount = BigNumber.from(DEFAULT_COLLECT_PRICE)
        .mul(TREASURY_FEE_BPS)
        .div(BPS_MAX);
      const expectedRecipientAmount =
        BigNumber.from(DEFAULT_COLLECT_PRICE).sub(expectedTreasuryAmount);

      expect(await currency.balanceOf(userTwoAddress)).to.eq(
        BigNumber.from(MAX_UINT256).sub(DEFAULT_COLLECT_PRICE)
      );
      expect(await currency.balanceOf(userAddress)).to.eq(expectedRecipientAmount);
      expect(await currency.balanceOf(treasuryAddress)).to.eq(expectedTreasuryAmount);
    });

    it('User should post with timed fee collect module as the collect module and data, user two follows, then collects twice, fee distribution is valid', async function () {
      const whitelisted = [userAddress, userTwoAddress]
      const leafNodes = whitelisted.map(addr => keccak256(addr));
      const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
      const merkleRoot = merkleTree.getHexRoot();
      const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
      const collectModuleInitData = abiCoder.encode(
        ['uint256', 'address', 'address', 'uint16', 'bool', 'bytes32'],
        [DEFAULT_COLLECT_PRICE, currency.address, userAddress, REFERRAL_FEE_BPS, true, merkleRoot]
      );
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: whitelistedTimedFeeCollectModule.address,
          collectModuleInitData: collectModuleInitData,
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(currency.mint(userTwoAddress, MAX_UINT256)).to.not.be.reverted;
      await expect(
        currency.connect(userTwo).approve(whitelistedTimedFeeCollectModule.address, MAX_UINT256)
      ).to.not.be.reverted;
      await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
      var data = abiCoder.encode(
        ['address', 'uint256'],
        [currency.address, DEFAULT_COLLECT_PRICE]
      );
      const encodedProof = abiCoder.encode(
        ['bytes32[]'],
        [proof]
      ).slice(2)
      data = data + encodedProof
      await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.not.be.reverted;
      await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.not.be.reverted;

      const expectedTreasuryAmount = BigNumber.from(DEFAULT_COLLECT_PRICE)
        .mul(TREASURY_FEE_BPS)
        .div(BPS_MAX);
      const expectedRecipientAmount =
        BigNumber.from(DEFAULT_COLLECT_PRICE).sub(expectedTreasuryAmount);

      expect(await currency.balanceOf(userTwoAddress)).to.eq(
        BigNumber.from(MAX_UINT256).sub(BigNumber.from(DEFAULT_COLLECT_PRICE).mul(2))
      );
      expect(await currency.balanceOf(userAddress)).to.eq(expectedRecipientAmount.mul(2));
      expect(await currency.balanceOf(treasuryAddress)).to.eq(expectedTreasuryAmount.mul(2));
    });

    it('User should post with timed fee collect module as the collect module and data, user two mirrors, follows, then collects from their mirror and pays fee, fee distribution is valid', async function () {
      const whitelisted = [userAddress, userTwoAddress]
      const leafNodes = whitelisted.map(addr => keccak256(addr));
      const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
      const merkleRoot = merkleTree.getHexRoot();
      const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
      const secondProfileId = FIRST_PROFILE_ID + 1;
      const collectModuleInitData = abiCoder.encode(
        ['uint256', 'address', 'address', 'uint16', 'bool', 'bytes32'],
        [DEFAULT_COLLECT_PRICE, currency.address, userAddress, REFERRAL_FEE_BPS, true, merkleRoot]
      );
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: whitelistedTimedFeeCollectModule.address,
          collectModuleInitData: collectModuleInitData,
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(
        lensHub.connect(userTwo).createProfile({
          to: userTwoAddress,
          handle: 'usertwo',
          imageURI: MOCK_PROFILE_URI,
          followModule: ZERO_ADDRESS,
          followModuleInitData: [],
          followNFTURI: MOCK_FOLLOW_NFT_URI,
        })
      ).to.not.be.reverted;
      await expect(
        lensHub.connect(userTwo).mirror({
          profileId: secondProfileId,
          profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModuleData: [],
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(currency.mint(userTwoAddress, MAX_UINT256)).to.not.be.reverted;
      await expect(
        currency.connect(userTwo).approve(whitelistedTimedFeeCollectModule.address, MAX_UINT256)
      ).to.not.be.reverted;
      await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
      var data = abiCoder.encode(
        ['address', 'uint256'],
        [currency.address, DEFAULT_COLLECT_PRICE]
      );
      const encodedProof = abiCoder.encode(
        ['bytes32[]'],
        [proof]
      ).slice(2)
      data = data + encodedProof
      await expect(lensHub.connect(userTwo).collect(secondProfileId, 1, data)).to.not.be.reverted;

      const expectedTreasuryAmount = BigNumber.from(DEFAULT_COLLECT_PRICE)
        .mul(TREASURY_FEE_BPS)
        .div(BPS_MAX);
      const expectedReferralAmount = BigNumber.from(DEFAULT_COLLECT_PRICE)
        .sub(expectedTreasuryAmount)
        .mul(REFERRAL_FEE_BPS)
        .div(BPS_MAX);
      const expectedReferrerAmount = BigNumber.from(MAX_UINT256)
        .sub(DEFAULT_COLLECT_PRICE)
        .add(expectedReferralAmount);
      const expectedRecipientAmount = BigNumber.from(DEFAULT_COLLECT_PRICE)
        .sub(expectedTreasuryAmount)
        .sub(expectedReferralAmount);

      expect(await currency.balanceOf(userTwoAddress)).to.eq(expectedReferrerAmount);
      expect(await currency.balanceOf(userAddress)).to.eq(expectedRecipientAmount);
      expect(await currency.balanceOf(treasuryAddress)).to.eq(expectedTreasuryAmount);
    });

    it('User should post with timed fee collect module as the collect module and data, with no referral fee, user two mirrors, follows, then collects from their mirror and pays fee, fee distribution is valid', async function () {
      const whitelisted = [userAddress, userTwoAddress]
      const leafNodes = whitelisted.map(addr => keccak256(addr));
      const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
      const merkleRoot = merkleTree.getHexRoot();
      const proof = merkleTree.getHexProof(keccak256(userTwoAddress));
      const secondProfileId = FIRST_PROFILE_ID + 1;
      const collectModuleInitData = abiCoder.encode(
        ['uint256', 'address', 'address', 'uint16', 'bool', 'bytes32'],
        [DEFAULT_COLLECT_PRICE, currency.address, userAddress, 0, true, merkleRoot]
      );
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: whitelistedTimedFeeCollectModule.address,
          collectModuleInitData: collectModuleInitData,
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(
        lensHub.connect(userTwo).createProfile({
          to: userTwoAddress,
          handle: 'usertwo',
          imageURI: MOCK_PROFILE_URI,
          followModule: ZERO_ADDRESS,
          followModuleInitData: [],
          followNFTURI: MOCK_FOLLOW_NFT_URI,
        })
      ).to.not.be.reverted;
      await expect(
        lensHub.connect(userTwo).mirror({
          profileId: secondProfileId,
          profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModuleData: [],
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(currency.mint(userTwoAddress, MAX_UINT256)).to.not.be.reverted;
      await expect(
        currency.connect(userTwo).approve(whitelistedTimedFeeCollectModule.address, MAX_UINT256)
      ).to.not.be.reverted;
      await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
      var data = abiCoder.encode(
        ['address', 'uint256'],
        [currency.address, DEFAULT_COLLECT_PRICE]
      );
      const encodedProof = abiCoder.encode(
        ['bytes32[]'],
        [proof]
      ).slice(2)
      data = data + encodedProof
      await expect(lensHub.connect(userTwo).collect(secondProfileId, 1, data)).to.not.be.reverted;

      const expectedTreasuryAmount = BigNumber.from(DEFAULT_COLLECT_PRICE)
        .mul(TREASURY_FEE_BPS)
        .div(BPS_MAX);
      const expectedRecipientAmount =
        BigNumber.from(DEFAULT_COLLECT_PRICE).sub(expectedTreasuryAmount);

      expect(await currency.balanceOf(userTwoAddress)).to.eq(
        BigNumber.from(MAX_UINT256).sub(DEFAULT_COLLECT_PRICE)
      );
      expect(await currency.balanceOf(userAddress)).to.eq(expectedRecipientAmount);
      expect(await currency.balanceOf(treasuryAddress)).to.eq(expectedTreasuryAmount);
    });
  });
});
