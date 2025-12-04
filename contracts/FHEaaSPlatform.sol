// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract FHEaaSPlatform is SepoliaConfig {

    struct EncryptedTask {
        uint256 id;
        euint32 encryptedData;
        uint256 timestamp;
    }

    struct DecryptedTask {
        string result;
        bool completed;
    }

    uint256 public taskCount;
    mapping(uint256 => EncryptedTask) public encryptedTasks;
    mapping(uint256 => DecryptedTask) public decryptedTasks;

    mapping(address => uint256[]) private userTasks;
    mapping(uint256 => uint256) private decryptionRequests;

    event TaskSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event TaskDecrypted(uint256 indexed id);

    modifier onlyTaskOwner(uint256 taskId) {
        _;
    }

    function submitEncryptedTask(euint32 encryptedData) public {
        taskCount += 1;
        uint256 newId = taskCount;

        encryptedTasks[newId] = EncryptedTask({
            id: newId,
            encryptedData: encryptedData,
            timestamp: block.timestamp
        });

        decryptedTasks[newId] = DecryptedTask({
            result: "",
            completed: false
        });

        userTasks[msg.sender].push(newId);

        emit TaskSubmitted(newId, block.timestamp);
    }

    function requestTaskDecryption(uint256 taskId) public onlyTaskOwner(taskId) {
        EncryptedTask storage task = encryptedTasks[taskId];
        require(!decryptedTasks[taskId].completed, "Already decrypted");

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(task.encryptedData);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptTask.selector);
        decryptionRequests[reqId] = taskId;

        emit DecryptionRequested(taskId);
    }

    function decryptTask(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        uint256 taskId = decryptionRequests[requestId];
        require(taskId != 0, "Invalid request");

        DecryptedTask storage dTask = decryptedTasks[taskId];
        require(!dTask.completed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));
        dTask.result = results[0];
        dTask.completed = true;

        emit TaskDecrypted(taskId);
    }

    function getDecryptedTask(uint256 taskId) public view returns (string memory result, bool completed) {
        DecryptedTask storage t = decryptedTasks[taskId];
        return (t.result, t.completed);
    }

    function getUserTasks(address user) public view returns (uint256[] memory) {
        return userTasks[user];
    }

    function submitBatchEncryptedTasks(euint32[] memory encryptedDataBatch) public {
        for (uint i = 0; i < encryptedDataBatch.length; i++) {
            submitEncryptedTask(encryptedDataBatch[i]);
        }
    }

    function requestBatchDecryption(uint256[] memory taskIds) public {
        for (uint i = 0; i < taskIds.length; i++) {
            requestTaskDecryption(taskIds[i]);
        }
    }

    function verifyDecryptionProof(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        FHE.checkSignatures(requestId, cleartexts, proof);
    }

    function helperBytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }
}